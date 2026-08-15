/**
 * 本文件封装关系图谱 Canvas 的 D3 力模拟、缩放、拖拽、空间命中与高性能绘制。
 */

'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import type { RelationshipGraphResponse } from '@workspace/contracts/relationship-graph';

import type {
  RelationshipGraphCanvasHandle,
  RelationshipGraphSimulationEdge,
  RelationshipGraphSimulationNode,
} from '../types/relationship-graph-canvas.types';
import type { RelationshipGraphSettings } from '../types/relationship-graph-settings.types';
import {
  drawRelationshipGraphFrame,
  getRelationshipGraphNodeRadius,
  readRelationshipGraphCanvasTheme,
  resolveRelationshipGraphCanvasColor,
} from '../utils/relationship-graph-canvas-renderer';
import {
  commitRelationshipGraphCanvasSize,
  useRelationshipGraphViewport,
  type RelationshipGraphViewportState,
} from './use-relationship-graph-viewport';
import { useRelationshipGraphInteractions } from './use-relationship-graph-interactions';

/** Hook 所需的受控页面状态与回调。 */
type UseRelationshipGraphCanvasOptions = {
  /** 实际承载像素绘制与 D3 指针事件的 Canvas。 */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 已经过页面筛选的关系图谱快照。 */
  data: RelationshipGraphResponse;
  /** 当前本地外观和力参数。 */
  settings: RelationshipGraphSettings;
  /** 页面当前选中的节点。 */
  selectedNodeId: string | null;
  /** 当前搜索命中的节点集合，未搜索时包含全部节点。 */
  searchMatchIds: ReadonlySet<string>;
  /** 颜色规则命中后的节点颜色。 */
  nodeColors: ReadonlyMap<string, string>;
  /** 单击节点时同步页面详情。 */
  onNodeSelect: (nodeId: string | null) => void;
  /** 双击节点时进入对应业务页面。 */
  onNodeDoubleClick: (nodeId: string) => void;
};

/** Hook 返回给轻量 Canvas 组件的指针事件和外部命令。 */
type UseRelationshipGraphCanvasResult = {
  /** 页面工具栏调用的画布命令。 */
  commands: RelationshipGraphCanvasHandle;
  /** 鼠标移动时通过四叉树更新悬停节点。 */
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  /** 鼠标离开时清理悬停状态。 */
  onPointerLeave: () => void;
  /** 单击时选中命中的节点或清空详情。 */
  onClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  /** 双击时打开命中节点的业务页面。 */
  onDoubleClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  /** 键盘快捷键支持缩放、适配和取消选择。 */
  onKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
};

/** 统一读取端点在 forceLink 初始化前后的节点标识。 */
function getEndpointId(endpoint: string | RelationshipGraphSimulationNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

/** 把线性进度转换成自然减速的选中动效进度。 */
function easeOutRelationshipGraphSelection(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/** 按黄金角生成稳定的圆盘初始坐标，避免节点重叠在同一个模拟起点。 */
function getRelationshipGraphInitialPosition(index: number): { x: number; y: number } {
  const angle = index * 2.399963229728653;
  const radius = 18 * Math.sqrt(index);
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

/** 封装关系图谱的完整 D3 Canvas 生命周期。 */
export function useRelationshipGraphCanvas({
  canvasRef,
  data,
  settings,
  selectedNodeId,
  searchMatchIds,
  nodeColors,
  onNodeSelect,
  onNodeDoubleClick,
}: UseRelationshipGraphCanvasOptions): UseRelationshipGraphCanvasResult {
  const nodesRef = useRef<RelationshipGraphSimulationNode[]>([]);
  const edgesRef = useRef<RelationshipGraphSimulationEdge[]>([]);
  const nodeByIdRef = useRef(new Map<string, RelationshipGraphSimulationNode>());
  const degreeByIdRef = useRef(new Map<string, number>());
  const adjacencyRef = useRef(new Map<string, Set<string>>());
  const quadtreeRef = useRef<d3.Quadtree<RelationshipGraphSimulationNode> | null>(null);
  const simulationRef = useRef<d3.Simulation<RelationshipGraphSimulationNode, undefined> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const sizeRef = useRef({ width: 0, height: 0, pixelRatio: 1 });
  const pendingSizeRef = useRef<{ width: number; height: number; pixelRatio: number } | null>(null);
  const viewport = useMemo<RelationshipGraphViewportState>(
    () => ({ zoomBehaviorRef, transformRef, sizeRef, pendingSizeRef }),
    [],
  );
  const animationFrameRef = useRef<number | null>(null);
  const selectionAnimationFrameRef = useRef<number | null>(null);
  const selectionAnimationProgressRef = useRef(0);
  const hoverAnimationFrameRef = useRef<number | null>(null);
  const hoverProgressByNodeIdRef = useRef(new Map<string, number>());
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const hoveredNodeIdRef = useRef<string | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const draggedRecentlyRef = useRef(false);
  const autoFitPendingRef = useRef(true);
  const themeRef = useRef<ReturnType<typeof readRelationshipGraphCanvasTheme> | null>(null);
  const visualStateRef = useRef({
    selectedNodeId,
    searchMatchIds,
    settings,
  });
  const resolvedNodeColorsRef = useRef(new Map<string, string>());

  /** 合并连续 tick 和交互触发，确保同一帧只提交一次尺寸并绘制完整图谱。 */
  const requestDraw = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const canvas = canvasRef.current;
      const currentTheme = themeRef.current;
      if (!canvas || !currentTheme) return;

      commitRelationshipGraphCanvasSize(canvas, viewport);
      const context = canvas.getContext('2d');
      const { width, height, pixelRatio } = sizeRef.current;
      if (!context || width <= 0 || height <= 0) return;

      const currentVisualState = visualStateRef.current;
      drawRelationshipGraphFrame({
        context,
        width,
        height,
        pixelRatio,
        transform: transformRef.current,
        nodes: nodesRef.current,
        edges: edgesRef.current,
        nodeById: nodeByIdRef.current,
        degreeById: degreeByIdRef.current,
        adjacency: adjacencyRef.current,
        theme: currentTheme,
        settings: currentVisualState.settings,
        selectedNodeId: currentVisualState.selectedNodeId,
        hoveredNodeId: hoveredNodeIdRef.current,
        draggedNodeId: draggedNodeIdRef.current,
        searchMatchIds: currentVisualState.searchMatchIds,
        resolvedNodeColors: resolvedNodeColorsRef.current,
        hoverProgressByNodeId: hoverProgressByNodeIdRef.current,
        selectionProgress: currentVisualState.selectedNodeId
          ? easeOutRelationshipGraphSelection(selectionAnimationProgressRef.current)
          : 0,
      });
    });
  }, [canvasRef, sizeRef, transformRef, viewport]);
  /** 在悬浮目标变化时同步补间节点、直连关系线与非直连内容的泛白状态。 */
  const transitionHoveredNode = useCallback(
    (nextNodeId: string | null): void => {
      hoveredNodeIdRef.current = nextNodeId;
      if (hoverAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverAnimationFrameRef.current);
        hoverAnimationFrameRef.current = null;
      }

      const previousProgress = new Map(hoverProgressByNodeIdRef.current);
      if (nextNodeId && !previousProgress.has(nextNodeId)) {
        previousProgress.set(nextNodeId, 0);
      }

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        hoverProgressByNodeIdRef.current = nextNodeId ? new Map([[nextNodeId, 1]]) : new Map();
        requestDraw();
        return;
      }

      const startedAt = window.performance.now();
      const animateHover = (now: number): void => {
        const linearProgress = Math.min(1, (now - startedAt) / 220);
        const animationProgress = easeOutRelationshipGraphSelection(linearProgress);
        const nextProgress = new Map<string, number>();

        for (const [nodeId, fromProgress] of previousProgress) {
          const targetProgress = nodeId === nextNodeId ? 1 : 0;
          const progress = fromProgress + (targetProgress - fromProgress) * animationProgress;
          if (progress > 0.001) nextProgress.set(nodeId, progress);
        }

        hoverProgressByNodeIdRef.current = nextProgress;
        requestDraw();
        if (linearProgress < 1) {
          hoverAnimationFrameRef.current = window.requestAnimationFrame(animateHover);
        } else {
          hoverAnimationFrameRef.current = null;
        }
      };

      hoverAnimationFrameRef.current = window.requestAnimationFrame(animateHover);
    },
    [requestDraw],
  );

  const { fitCanvas, zoomBy, focusNode } = useRelationshipGraphViewport({
    canvasRef,
    nodesRef,
    nodeByIdRef,
    viewport,
  });

  /** 清除旧布局坐标，从稳定圆盘起点重新运行力导向模拟。 */
  const restartLayout = useCallback(() => {
    positionsRef.current.clear();
    autoFitPendingRef.current = true;
    nodesRef.current.forEach((node, index) => {
      const initialPosition = getRelationshipGraphInitialPosition(index);
      node.x = initialPosition.x;
      node.y = initialPosition.y;
      node.vx = 0;
      node.vy = 0;
      node.fx = null;
      node.fy = null;
    });
    simulationRef.current?.alpha(1).restart();
  }, []);

  /** 通过屏幕指针和四叉树查找命中的最近节点。 */
  const findNodeAtPointer = useCallback(
    (clientX: number, clientY: number): RelationshipGraphSimulationNode | null => {
      const canvas = canvasRef.current;
      const tree = quadtreeRef.current;
      if (!canvas || !tree) return null;
      const rect = canvas.getBoundingClientRect();
      const [graphX, graphY] = transformRef.current.invert([clientX - rect.left, clientY - rect.top]);
      const maxRadius = 18 / transformRef.current.k;
      const candidate = tree.find(graphX, graphY, maxRadius);
      if (!candidate) return null;
      const radius =
        getRelationshipGraphNodeRadius(
          candidate,
          degreeByIdRef.current.get(candidate.id) ?? 0,
          visualStateRef.current.settings.appearance.nodeSizeScale,
        ) +
        5 / transformRef.current.k;
      return Math.hypot((candidate.x ?? 0) - graphX, (candidate.y ?? 0) - graphY) <= radius ? candidate : null;
    },
    [canvasRef],
  );

  const canvasEvents = useRelationshipGraphInteractions({
    canvasRef,
    simulationRef,
    zoomBehaviorRef,
    transformRef,
    hoveredNodeIdRef,
    draggedNodeIdRef,
    draggedRecentlyRef,
    findNodeAtPointer,
    transitionHoveredNode,
    requestDraw,
    fitCanvas,
    zoomBy,
    onNodeSelect,
    onNodeDoubleClick,
  });

  /** 在每次数据或力参数变化时重建可变 D3 模拟对象。 */
  useEffect(() => {
    const cachedPositions = positionsRef.current;
    const nodes: RelationshipGraphSimulationNode[] = data.nodes.map((node, index) => {
      const cached = cachedPositions.get(node.id);
      const initialPosition = getRelationshipGraphInitialPosition(index);
      return {
        ...node,
        x: cached?.x ?? initialPosition.x,
        y: cached?.y ?? initialPosition.y,
      };
    });
    const edges: RelationshipGraphSimulationEdge[] = data.edges.map((edge) => ({ ...edge }));
    autoFitPendingRef.current = true;
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const degreeById = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>(nodes.map((node) => [node.id, new Set<string>()]));
    for (const edge of edges) {
      const sourceId = getEndpointId(edge.source);
      const targetId = getEndpointId(edge.target);
      degreeById.set(sourceId, (degreeById.get(sourceId) ?? 0) + 1);
      degreeById.set(targetId, (degreeById.get(targetId) ?? 0) + 1);
      adjacency.get(sourceId)?.add(targetId);
      adjacency.get(targetId)?.add(sourceId);
    }
    nodesRef.current = nodes;
    edgesRef.current = edges;
    nodeByIdRef.current = nodeById;
    degreeByIdRef.current = degreeById;
    adjacencyRef.current = adjacency;

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink<RelationshipGraphSimulationNode, RelationshipGraphSimulationEdge>(edges)
          .id((node) => node.id)
          .distance((edge) => settings.forces.linkDistance + Math.min(edge.weight, 5) * 4)
          .strength(settings.forces.linkStrength),
      )
      .force('charge', d3.forceManyBody().strength(settings.forces.chargeStrength))
      .force('center', d3.forceCenter(0, 0))
      .force('inward', d3.forceRadial<RelationshipGraphSimulationNode>(0).strength(settings.forces.centerStrength))
      .force(
        'collision',
        d3
          .forceCollide<RelationshipGraphSimulationNode>()
          .radius(
            (node) =>
              getRelationshipGraphNodeRadius(node, degreeById.get(node.id) ?? 0, settings.appearance.nodeSizeScale) + 4,
          )
          .iterations(2),
      )
      .alphaDecay(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.08 : 0.028);

    let ticks = 0;
    simulation.on('tick', () => {
      ticks += 1;
      for (const node of nodes) {
        cachedPositions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
      }
      quadtreeRef.current = d3
        .quadtree<RelationshipGraphSimulationNode>()
        .x((node) => node.x ?? 0)
        .y((node) => node.y ?? 0)
        .addAll(nodes);
      requestDraw();

      if (ticks >= 60 && autoFitPendingRef.current && fitCanvas()) {
        autoFitPendingRef.current = false;
      }
    });
    simulationRef.current = simulation;

    return () => {
      simulation.stop();
      if (simulationRef.current === simulation) simulationRef.current = null;
    };
  }, [
    data.edges,
    data.nodes,
    fitCanvas,
    requestDraw,
    settings.appearance.nodeSizeScale,
    settings.forces.centerStrength,
    settings.forces.chargeStrength,
    settings.forces.linkDistance,
    settings.forces.linkStrength,
  ]);

  /** 监听容器尺寸；最新尺寸由绘制帧统一提交，避免 Canvas 重置后短暂闪白。 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    /** 记录 ResizeObserver 最新测量结果并合并到下一绘制帧。 */
    const resizeCanvas = (): void => {
      const rect = canvas.getBoundingClientRect();
      const nextSize = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      };
      const currentSize = pendingSizeRef.current ?? sizeRef.current;
      if (
        nextSize.width === currentSize.width &&
        nextSize.height === currentSize.height &&
        nextSize.pixelRatio === currentSize.pixelRatio
      ) {
        return;
      }

      pendingSizeRef.current = nextSize;
      requestDraw();
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [canvasRef, pendingSizeRef, requestDraw, sizeRef]);

  /** 监听明暗主题切换并刷新 Canvas 色板，不触发 React 组件重渲染。 */
  useEffect(() => {
    /** 从当前 CSS 变量同步可直接绘制的主题颜色。 */
    const updateTheme = (): void => {
      themeRef.current = readRelationshipGraphCanvasTheme();
      requestDraw();
    };

    updateTheme();
    const themeObserver = new MutationObserver(updateTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => themeObserver.disconnect();
  }, [requestDraw]);
  /** 将最新受控视觉状态同步到绘制循环，而不让物理布局重新启动。 */
  useEffect(() => {
    visualStateRef.current = { selectedNodeId, searchMatchIds, settings };
    resolvedNodeColorsRef.current = new Map(
      [...nodeColors]
        .map(([nodeId, color]) => [nodeId, resolveRelationshipGraphCanvasColor(color, '')] as [string, string])
        .filter((entry) => Boolean(entry[1])),
    );
    requestDraw();
  }, [nodeColors, requestDraw, searchMatchIds, selectedNodeId, settings]);

  /** 在节点选中后平滑同步节点放大、节点变色和相邻关系线变色。 */
  useEffect(() => {
    if (selectionAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(selectionAnimationFrameRef.current);
      selectionAnimationFrameRef.current = null;
    }

    if (!selectedNodeId) {
      selectionAnimationProgressRef.current = 0;
      requestDraw();
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      selectionAnimationProgressRef.current = 1;
      requestDraw();
      return;
    }

    selectionAnimationProgressRef.current = 0;
    const startedAt = window.performance.now();
    const animateSelection = (now: number): void => {
      selectionAnimationProgressRef.current = Math.min(1, (now - startedAt) / 260);
      requestDraw();
      if (selectionAnimationProgressRef.current < 1) {
        selectionAnimationFrameRef.current = window.requestAnimationFrame(animateSelection);
      } else {
        selectionAnimationFrameRef.current = null;
      }
    };
    selectionAnimationFrameRef.current = window.requestAnimationFrame(animateSelection);

    return () => {
      if (selectionAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(selectionAnimationFrameRef.current);
        selectionAnimationFrameRef.current = null;
      }
    };
  }, [requestDraw, selectedNodeId]);

  /** 卸载时取消尚未执行的绘制帧。 */
  useEffect(
    () => () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (hoverAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverAnimationFrameRef.current);
        hoverAnimationFrameRef.current = null;
      }
    },
    [],
  );

  return {
    commands: {
      fitCanvas,
      zoomIn: () => zoomBy(1.3),
      zoomOut: () => zoomBy(1 / 1.3),
      restartLayout,
      focusNode,
    },
    ...canvasEvents,
  };
}
