/**
 * 本文件封装关系图谱 Canvas 的 D3 力模拟、缩放、拖拽、空间命中与高性能绘制。
 */

'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { RelationshipGraphResponse } from '@workspace/contracts/relationship-graph';

import type {
  RelationshipGraphCanvasHandle,
  RelationshipGraphCanvasTheme,
  RelationshipGraphSimulationEdge,
  RelationshipGraphSimulationNode,
} from '../types/relationship-graph-canvas.types';
import type { RelationshipGraphSettings } from '../types/relationship-graph-settings.types';

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

/** D3 拖拽行为使用的节点主体。 */
type RelationshipGraphDragSubject = {
  /** 当前被拖拽的真实 D3 节点。 */
  node: RelationshipGraphSimulationNode;
  /** D3 drag 使用的屏幕横坐标。 */
  x: number;
  /** D3 drag 使用的屏幕纵坐标。 */
  y: number;
};

/** 统一读取端点在 forceLink 初始化前后的节点标识。 */
function getEndpointId(endpoint: string | RelationshipGraphSimulationNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id;
}

/** 统一读取端点在 forceLink 初始化后的节点对象。 */
function getEndpointNode(
  endpoint: string | RelationshipGraphSimulationNode,
  nodeById: ReadonlyMap<string, RelationshipGraphSimulationNode>,
): RelationshipGraphSimulationNode | undefined {
  return typeof endpoint === 'string' ? nodeById.get(endpoint) : endpoint;
}

/** 从主题变量读取 Canvas 可直接使用的计算颜色。 */
function readCssColor(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return resolveRelationshipGraphCanvasColor(styles.getPropertyValue(name).trim() || fallback, fallback);
}

/** 从鼠标或单指触控原生事件中读取客户端坐标，多指手势交由 D3 zoom 处理。 */
function readRelationshipGraphSourcePointer(
  event: MouseEvent | TouchEvent,
): { clientX: number; clientY: number } | null {
  if ('touches' in event) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
  }
  return { clientX: event.clientX, clientY: event.clientY };
}

/** 读取当前明暗主题下的图谱色板，不在业务样式中固化颜色。 */
function readRelationshipGraphCanvasTheme(): RelationshipGraphCanvasTheme {
  const styles = window.getComputedStyle(document.documentElement);

  return {
    nodeColors: {
      PROJECT: readCssColor(styles, '--project-accent', 'CanvasText'),
      AREA: readCssColor(styles, '--chart-2', 'CanvasText'),
      DECISION: readCssColor(styles, '--decision-accent', 'CanvasText'),
      MEETING: readCssColor(styles, '--decision-meeting', 'CanvasText'),
      PROPOSAL: readCssColor(styles, '--decision-proposal', 'CanvasText'),
      VOTE_ROUND: readCssColor(styles, '--decision-vote', 'CanvasText'),
      RESOLUTION: readCssColor(styles, '--decision-resolution', 'CanvasText'),
      USER: readCssColor(styles, '--chart-3', 'CanvasText'),
    },
    linkColor: readCssColor(styles, '--border', 'GrayText'),
    linkHighlightColor: readCssColor(styles, '--relationship-graph-link-highlight', 'Highlight'),
    labelColor: readCssColor(styles, '--foreground', 'CanvasText'),
    focusColor: readCssColor(styles, '--ring', 'Highlight'),
    backgroundColor: readCssColor(styles, '--card', 'Canvas'),
  };
}

/** 依据业务类型和连接度计算节点基础半径。 */
function getRelationshipGraphNodeRadius(
  node: RelationshipGraphSimulationNode,
  degree: number,
  nodeSizeScale: number,
): number {
  const typeScale = node.type === 'PROJECT' ? 1.45 : node.type === 'USER' ? 1.2 : 1;
  return (4.2 + Math.min(Math.sqrt(degree) * 1.15, 5.5)) * typeScale * nodeSizeScale;
}

/** 把线性进度转换成自然减速的选中动效进度。 */
function easeOutRelationshipGraphSelection(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/** 根据缩放倍率计算普通标签的渐显进度，避免适配视图一次展示全部文字。 */
function getRelationshipGraphLabelRevealProgress(scale: number): number {
  const progress = Math.max(0, Math.min(1, (scale - 1.15) / 0.85));
  return progress * progress * (3 - 2 * progress);
}

/** 将过长标签压缩成适合 Canvas 的单行标题。 */
function truncateRelationshipGraphLabel(title: string): string {
  return title.length > 22 ? `${title.slice(0, 21)}…` : title;
}

/** 校验用户运行时颜色，非法 CSS 颜色安全回退到对应主题色。 */
function resolveRelationshipGraphCanvasColor(candidate: string, fallback: string): string {
  if (!CSS.supports('color', candidate)) return fallback;

  const probe = document.createElement('span');
  probe.style.color = candidate;
  probe.style.position = 'fixed';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  document.body.append(probe);
  const resolvedColor = window.getComputedStyle(probe).color;
  probe.remove();
  if (!resolvedColor) return fallback;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorContext = colorCanvas.getContext('2d', { willReadFrequently: true });
  if (!colorContext) return resolvedColor;

  colorContext.clearRect(0, 0, 1, 1);
  colorContext.fillStyle = resolvedColor;
  colorContext.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
  return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
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

/** 在有向连线末端绘制不遮挡目标节点的小箭头。 */
function drawRelationshipGraphArrow(
  context: CanvasRenderingContext2D,
  source: RelationshipGraphSimulationNode,
  target: RelationshipGraphSimulationNode,
  targetRadius: number,
  width: number,
): void {
  const sourceX = source.x ?? 0;
  const sourceY = source.y ?? 0;
  const targetX = target.x ?? 0;
  const targetY = target.y ?? 0;
  const angle = Math.atan2(targetY - sourceY, targetX - sourceX);
  const arrowX = targetX - Math.cos(angle) * (targetRadius + 2);
  const arrowY = targetY - Math.sin(angle) * (targetRadius + 2);
  const arrowSize = 4.5 + Math.min(width, 3);

  context.beginPath();
  context.moveTo(arrowX, arrowY);
  context.lineTo(
    arrowX - Math.cos(angle - Math.PI / 6) * arrowSize,
    arrowY - Math.sin(angle - Math.PI / 6) * arrowSize,
  );
  context.lineTo(
    arrowX - Math.cos(angle + Math.PI / 6) * arrowSize,
    arrowY - Math.sin(angle + Math.PI / 6) * arrowSize,
  );
  context.closePath();
  context.fill();
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
  const animationFrameRef = useRef<number | null>(null);
  const selectionAnimationFrameRef = useRef<number | null>(null);
  const selectionAnimationProgressRef = useRef(0);
  const hoverAnimationFrameRef = useRef<number | null>(null);
  const hoverProgressByNodeIdRef = useRef(new Map<string, number>());
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const hoveredNodeIdRef = useRef<string | null>(null);
  const draggedNodeIdRef = useRef<string | null>(null);
  const draggedRecentlyRef = useRef(false);
  const fitSignatureRef = useRef<string | null>(null);
  const graphSignatureRef = useRef<string | null>(null);
  const layoutTickCountRef = useRef(0);
  const [theme, setTheme] = useState<RelationshipGraphCanvasTheme | null>(null);
  const visualStateRef = useRef({
    selectedNodeId,
    searchMatchIds,
    nodeColors,
    settings,
    theme,
  });
  const resolvedNodeColorsRef = useRef(new Map<string, string>());

  /** 合并连续 tick 和交互触发，确保同一帧只绘制一次。 */
  const requestDraw = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const canvas = canvasRef.current;
      const currentTheme = visualStateRef.current.theme;
      if (!canvas || !currentTheme) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      const { width, height, pixelRatio } = sizeRef.current;
      if (width <= 0 || height <= 0) return;

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = currentTheme.backgroundColor;
      context.fillRect(0, 0, width, height);

      const transform = transformRef.current;
      context.save();
      context.translate(transform.x, transform.y);
      context.scale(transform.k, transform.k);

      const {
        selectedNodeId: currentSelectedId,
        searchMatchIds: currentSearchMatchIds,
        settings: currentSettings,
      } = visualStateRef.current;
      const hoveredNodeId = hoveredNodeIdRef.current;
      const draggedNodeId = draggedNodeIdRef.current;
      const activeNodeId = draggedNodeId ?? currentSelectedId;
      const hoverProgressByNodeId = hoverProgressByNodeIdRef.current;
      let hoverProgress = 0;
      for (const progress of hoverProgressByNodeId.values()) {
        hoverProgress = Math.min(1, hoverProgress + progress);
      }
      const searchIsActive = currentSearchMatchIds.size < nodesRef.current.length;
      const selectionProgress = currentSelectedId
        ? easeOutRelationshipGraphSelection(selectionAnimationProgressRef.current)
        : 0;
      const hoverLayerNodeIds = new Set<string>();
      if (hoveredNodeId) hoverLayerNodeIds.add(hoveredNodeId);
      if (draggedNodeId) hoverLayerNodeIds.add(draggedNodeId);
      for (const [nodeId, progress] of hoverProgressByNodeId) {
        if (progress > 0.001) hoverLayerNodeIds.add(nodeId);
      }
      const relatedHoverNodeIds = new Set<string>();
      for (const nodeId of hoverLayerNodeIds) {
        relatedHoverNodeIds.add(nodeId);
        for (const neighborId of adjacencyRef.current.get(nodeId) ?? []) {
          relatedHoverNodeIds.add(neighborId);
        }
      }

      for (const edge of edgesRef.current) {
        const source = getEndpointNode(edge.source, nodeByIdRef.current);
        const target = getEndpointNode(edge.target, nodeByIdRef.current);
        if (!source || !target) continue;

        const touchesActive = !activeNodeId || source.id === activeNodeId || target.id === activeNodeId;
        const touchesSelectedNode =
          Boolean(currentSelectedId) && (source.id === currentSelectedId || target.id === currentSelectedId);
        const touchesSearch =
          !searchIsActive || currentSearchMatchIds.has(source.id) || currentSearchMatchIds.has(target.id);
        const opacity = (touchesActive ? 0.62 : 0.08) * (touchesSearch ? 1 : 0.22);
        const widthScale = currentSettings.appearance.linkWidthScale;
        const lineWidth = (0.55 + Math.min(edge.weight, 5) * 0.28) * widthScale;

        context.globalAlpha = opacity;
        const linkHighlightProgress = Math.min(1, touchesSelectedNode ? selectionProgress : 0);
        const linkColor = d3.interpolateRgb(
          currentTheme.linkColor,
          currentTheme.linkHighlightColor,
        )(linkHighlightProgress);
        context.strokeStyle = linkColor;
        context.fillStyle = linkColor;
        context.lineWidth = lineWidth;
        context.beginPath();
        context.moveTo(source.x ?? 0, source.y ?? 0);
        context.lineTo(target.x ?? 0, target.y ?? 0);
        context.stroke();

        if (currentSettings.appearance.showArrows && edge.directed) {
          const targetHighlightProgress = Math.max(
            target.id === currentSelectedId ? selectionProgress : 0,
            hoverProgressByNodeId.get(target.id) ?? 0,
          );
          const targetRadius =
            getRelationshipGraphNodeRadius(
              target,
              degreeByIdRef.current.get(target.id) ?? 0,
              currentSettings.appearance.nodeSizeScale,
            ) *
            (1 + targetHighlightProgress * 0.12);
          drawRelationshipGraphArrow(context, source, target, targetRadius, lineWidth);
        }
      }

      /** 按当前帧状态绘制单个节点及文字，供底层与顶层节点复用。 */
      const drawNode = (node: RelationshipGraphSimulationNode): void => {
        const isSelected = node.id === currentSelectedId;
        const nodeHoverProgress = hoverProgressByNodeId.get(node.id) ?? 0;
        const isHovered = node.id === hoveredNodeId || nodeHoverProgress > 0.01;
        const matchesSearch = currentSearchMatchIds.has(node.id);
        const nodeOpacity = matchesSearch ? 1 : 0.16;
        const baseRadius = getRelationshipGraphNodeRadius(
          node,
          degreeByIdRef.current.get(node.id) ?? 0,
          currentSettings.appearance.nodeSizeScale,
        );
        const radius = baseRadius * (1 + Math.max(isSelected ? selectionProgress : 0, nodeHoverProgress) * 0.12);
        const x = node.x ?? 0;
        const y = node.y ?? 0;

        context.globalAlpha = nodeOpacity;
        const defaultNodeColor = currentTheme.nodeColors[node.type];
        const nodeColor = resolvedNodeColorsRef.current.get(node.id) ?? defaultNodeColor;
        const selectedHighlightProgress = isSelected ? selectionProgress * (1 - hoverProgress) : 0;
        const selectedNodeColor = d3.interpolateRgb(
          nodeColor,
          currentTheme.linkHighlightColor,
        )(selectedHighlightProgress);
        let relatedHoverProgress = nodeHoverProgress;
        for (const neighborId of adjacencyRef.current.get(node.id) ?? []) {
          relatedHoverProgress = Math.max(relatedHoverProgress, hoverProgressByNodeId.get(neighborId) ?? 0);
        }
        const whitenProgress = Math.max(0, hoverProgress - relatedHoverProgress) * 0.68;
        const whitenedNodeColor = d3.interpolateRgb(selectedNodeColor, currentTheme.backgroundColor)(whitenProgress);
        context.fillStyle = d3.interpolateRgb(whitenedNodeColor, currentTheme.linkHighlightColor)(nodeHoverProgress);
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();

        if (isSelected || isHovered || node.isCurrentUser) {
          const focusProgress = Math.max(
            isSelected ? selectionProgress : 0,
            nodeHoverProgress,
            node.isCurrentUser ? 1 : 0,
          );
          context.globalAlpha = (matchesSearch ? 0.95 : 0.35) * focusProgress;
          context.strokeStyle =
            isSelected || nodeHoverProgress > 0 ? currentTheme.linkHighlightColor : currentTheme.focusColor;
          context.lineWidth = 1.4 + Math.max(selectionProgress, nodeHoverProgress) * 0.8;
          context.beginPath();
          context.arc(x, y, radius + 2.5 + focusProgress * 1.5, 0, Math.PI * 2);
          context.stroke();
        }

        const labelRevealProgress = getRelationshipGraphLabelRevealProgress(transform.k);
        const shouldDrawLabel =
          currentSettings.appearance.labelOpacity > 0 &&
          (isSelected || isHovered || node.isCurrentUser || labelRevealProgress > 0.01);
        if (!shouldDrawLabel) return;

        context.globalAlpha =
          nodeOpacity *
          (isSelected || isHovered || node.isCurrentUser
            ? Math.max(currentSettings.appearance.labelOpacity, 0.82)
            : currentSettings.appearance.labelOpacity * labelRevealProgress);
        context.fillStyle = d3.interpolateRgb(currentTheme.labelColor, currentTheme.backgroundColor)(whitenProgress);
        const labelSize = 11 / Math.pow(Math.max(transform.k, 0.25), 0.18);
        context.font = `${labelSize}px ui-sans-serif, system-ui, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'top';
        context.fillText(truncateRelationshipGraphLabel(node.title), x, y + radius + 5, 170);
      };

      for (const node of nodesRef.current) {
        if (!relatedHoverNodeIds.has(node.id)) drawNode(node);
      }

      if (hoverLayerNodeIds.size > 0) {
        for (const edge of edgesRef.current) {
          const source = getEndpointNode(edge.source, nodeByIdRef.current);
          const target = getEndpointNode(edge.target, nodeByIdRef.current);
          if (!source || !target || (!hoverLayerNodeIds.has(source.id) && !hoverLayerNodeIds.has(target.id))) {
            continue;
          }

          const edgeHoverProgress = Math.max(
            hoverProgressByNodeId.get(source.id) ?? 0,
            hoverProgressByNodeId.get(target.id) ?? 0,
          );
          if (edgeHoverProgress <= 0.001) continue;
          const targetHighlightProgress = Math.max(
            target.id === currentSelectedId ? selectionProgress : 0,
            hoverProgressByNodeId.get(target.id) ?? 0,
          );
          const targetRadius =
            getRelationshipGraphNodeRadius(
              target,
              degreeByIdRef.current.get(target.id) ?? 0,
              currentSettings.appearance.nodeSizeScale,
            ) *
            (1 + targetHighlightProgress * 0.12);
          const touchesSearch =
            !searchIsActive || currentSearchMatchIds.has(source.id) || currentSearchMatchIds.has(target.id);
          const lineWidth = (0.55 + Math.min(edge.weight, 5) * 0.28) * currentSettings.appearance.linkWidthScale;

          context.globalAlpha = 0.62 * edgeHoverProgress * (touchesSearch ? 1 : 0.22);
          context.strokeStyle = currentTheme.linkHighlightColor;
          context.fillStyle = currentTheme.linkHighlightColor;
          context.lineWidth = lineWidth;
          context.beginPath();
          context.moveTo(source.x ?? 0, source.y ?? 0);
          context.lineTo(target.x ?? 0, target.y ?? 0);
          context.stroke();

          if (currentSettings.appearance.showArrows && edge.directed) {
            drawRelationshipGraphArrow(context, source, target, targetRadius, lineWidth);
          }
        }
      }

      for (const node of nodesRef.current) {
        if (relatedHoverNodeIds.has(node.id)) drawNode(node);
      }

      context.restore();
      context.globalAlpha = 1;
    });
  }, [canvasRef]);

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

  /** 根据当前可见节点边界生成适配画布的缩放变换。 */
  const fitCanvas = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    const nodes = nodesRef.current;
    const { width, height } = sizeRef.current;
    if (!canvas || !zoomBehavior || nodes.length === 0 || width <= 1 || height <= 1) return false;

    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const graphWidth = Math.max(maxX - minX, 80);
    const graphHeight = Math.max(maxY - minY, 80);
    const scale = Math.max(0.08, Math.min(2.5, 0.84 / Math.max(graphWidth / width, graphHeight / height)));
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-(minX + maxX) / 2, -(minY + maxY) / 2);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const selection = d3.select(canvas);

    if (prefersReducedMotion) {
      selection.call(zoomBehavior.transform, transform);
    } else {
      selection.transition().duration(280).call(zoomBehavior.transform, transform);
    }
    return true;
  }, [canvasRef]);

  /** 将缩放倍率按相对倍数平滑调整。 */
  const zoomBy = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      const zoomBehavior = zoomBehaviorRef.current;
      if (!canvas || !zoomBehavior) return;
      const selection = d3.select(canvas);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        selection.call(zoomBehavior.scaleBy, factor);
      } else {
        selection.transition().duration(180).call(zoomBehavior.scaleBy, factor);
      }
    },
    [canvasRef],
  );

  /** 将指定节点平移到当前画布中心并保留合理缩放。 */
  const focusNode = useCallback(
    (nodeId: string) => {
      const canvas = canvasRef.current;
      const zoomBehavior = zoomBehaviorRef.current;
      const node = nodeByIdRef.current.get(nodeId);
      const { width, height } = sizeRef.current;
      if (!canvas || !zoomBehavior || !node) return;

      const scale = Math.max(transformRef.current.k, 1.15);
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-(node.x ?? 0), -(node.y ?? 0));
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const selection = d3.select(canvas);
      if (prefersReducedMotion) selection.call(zoomBehavior.transform, transform);
      else selection.transition().duration(260).call(zoomBehavior.transform, transform);
    },
    [canvasRef],
  );

  /** 清除旧布局坐标，从稳定圆盘起点重新运行力导向模拟。 */
  const restartLayout = useCallback(() => {
    positionsRef.current.clear();
    fitSignatureRef.current = null;
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
    const graphSignature = `${data.nodes
      .map((node) => node.id)
      .sort()
      .join('|')}::${data.edges
      .map((edge) => edge.id)
      .sort()
      .join('|')}`;
    graphSignatureRef.current = graphSignature;
    fitSignatureRef.current = null;
    layoutTickCountRef.current = 0;
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
      layoutTickCountRef.current = ticks;
      for (const node of nodes) {
        cachedPositions.set(node.id, { x: node.x ?? 0, y: node.y ?? 0 });
      }
      quadtreeRef.current = d3
        .quadtree<RelationshipGraphSimulationNode>()
        .x((node) => node.x ?? 0)
        .y((node) => node.y ?? 0)
        .addAll(nodes);
      requestDraw();

      if (ticks >= 60 && fitSignatureRef.current !== graphSignature && fitCanvas()) {
        fitSignatureRef.current = graphSignature;
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

  /** 监听容器尺寸、设备像素比和主题切换，保持画布清晰且与主题一致。 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateTheme = () => {
      setTheme(readRelationshipGraphCanvasTheme());
      requestDraw();
    };
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      const isInitialMeasurement = sizeRef.current.width === 0 || sizeRef.current.height === 0;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      sizeRef.current = { width, height, pixelRatio };
      if (isInitialMeasurement) {
        transformRef.current = d3.zoomIdentity.translate(width / 2, height / 2);
      }
      requestDraw();

      const graphSignature = graphSignatureRef.current;
      if (
        width > 1 &&
        height > 1 &&
        graphSignature &&
        layoutTickCountRef.current >= 60 &&
        fitSignatureRef.current !== graphSignature &&
        fitCanvas()
      ) {
        fitSignatureRef.current = graphSignature;
      }
    };

    updateTheme();
    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    const themeObserver = new MutationObserver(updateTheme);
    resizeObserver.observe(canvas);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', resizeCanvas);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [canvasRef, fitCanvas, requestDraw]);

  /** 安装 D3 zoom 与鼠标节点 drag，并让触控手势保留给缩放和平移。 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const zoomBehavior = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.08, 8])
      .filter((event) => {
        if (event.type === 'dblclick') return false;
        if (event.type === 'mousedown') {
          const mouseEvent = event as MouseEvent;
          return !findNodeAtPointer(mouseEvent.clientX, mouseEvent.clientY);
        }
        return true;
      })
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        requestDraw();
      });
    zoomBehaviorRef.current = zoomBehavior;

    const dragBehavior = d3
      .drag<HTMLCanvasElement, unknown, RelationshipGraphDragSubject>()
      .filter((event) => {
        if (event.type === 'mousedown' && event.button !== 0) return false;
        if (event.type === 'touchstart' && event.touches?.length !== 1) return false;
        const pointer = readRelationshipGraphSourcePointer(event as MouseEvent | TouchEvent);
        return pointer ? Boolean(findNodeAtPointer(pointer.clientX, pointer.clientY)) : false;
      })
      .subject((event) => {
        const pointer = readRelationshipGraphSourcePointer(event.sourceEvent as MouseEvent | TouchEvent);
        const node = pointer ? findNodeAtPointer(pointer.clientX, pointer.clientY) : null;
        return {
          node: node!,
          x: transformRef.current.applyX(node?.x ?? 0),
          y: transformRef.current.applyY(node?.y ?? 0),
        };
      })
      .on('start', (event) => {
        if (!event.active) simulationRef.current?.alphaTarget(0.24).restart();
        event.subject.node.fx = event.subject.node.x;
        event.subject.node.fy = event.subject.node.y;
        draggedNodeIdRef.current = event.subject.node.id;
        transitionHoveredNode(event.subject.node.id);
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        draggedRecentlyRef.current = false;
        requestDraw();
      })
      .on('drag', (event) => {
        const [graphX, graphY] = transformRef.current.invert([event.x, event.y]);
        event.subject.node.fx = graphX;
        event.subject.node.fy = graphY;
        draggedRecentlyRef.current = true;
        requestDraw();
      })
      .on('end', (event) => {
        if (!event.active) simulationRef.current?.alphaTarget(0);
        event.subject.node.fx = null;
        event.subject.node.fy = null;
        draggedNodeIdRef.current = null;
        const pointer = readRelationshipGraphSourcePointer(event.sourceEvent as MouseEvent | TouchEvent);
        const rect = canvas.getBoundingClientRect();
        const pointerIsInsideCanvas = Boolean(
          pointer &&
          pointer.clientX >= rect.left &&
          pointer.clientX <= rect.right &&
          pointer.clientY >= rect.top &&
          pointer.clientY <= rect.bottom,
        );
        transitionHoveredNode(pointerIsInsideCanvas ? event.subject.node.id : null);
        canvas.style.cursor = pointerIsInsideCanvas ? 'pointer' : 'grab';
        requestDraw();
        window.setTimeout(() => {
          draggedRecentlyRef.current = false;
        }, 0);
      });
    dragBehavior.clickDistance(3);

    const selection = d3.select(canvas);
    selection
      .call(zoomBehavior)
      .call(zoomBehavior.transform, transformRef.current)
      .call(dragBehavior)
      .on('dblclick.zoom', null);

    return () => {
      selection.on('.zoom', null).on('.drag', null);
      if (zoomBehaviorRef.current === zoomBehavior) zoomBehaviorRef.current = null;
    };
  }, [canvasRef, findNodeAtPointer, requestDraw, transitionHoveredNode]);

  /** 将最新受控视觉状态同步到绘制循环，而不让物理布局重新启动。 */
  useEffect(() => {
    visualStateRef.current = { selectedNodeId, searchMatchIds, nodeColors, settings, theme };
    resolvedNodeColorsRef.current = new Map(
      [...nodeColors]
        .map(([nodeId, color]) => [nodeId, resolveRelationshipGraphCanvasColor(color, '')] as [string, string])
        .filter((entry) => Boolean(entry[1])),
    );
    requestDraw();
  }, [nodeColors, requestDraw, searchMatchIds, selectedNodeId, settings, theme]);

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

  /** 指针移动时借助四叉树更新鼠标样式和邻接高亮。 */
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === 'touch') return;
      if (draggedNodeIdRef.current) return;
      const node = findNodeAtPointer(event.clientX, event.clientY);
      const nextId = node?.id ?? null;
      if (nextId === hoveredNodeIdRef.current) return;
      transitionHoveredNode(nextId);
      if (canvasRef.current) canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
    },
    [canvasRef, findNodeAtPointer, transitionHoveredNode],
  );

  /** 指针离开画布后清理悬停关系高亮。 */
  const onPointerLeave = useCallback(() => {
    if (draggedNodeIdRef.current) return;
    transitionHoveredNode(null);
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, [canvasRef, transitionHoveredNode]);

  /** 单击命中节点时打开详情，单击空白时清理选中。 */
  const onClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (draggedRecentlyRef.current) return;
      onNodeSelect(findNodeAtPointer(event.clientX, event.clientY)?.id ?? null);
    },
    [findNodeAtPointer, onNodeSelect],
  );

  /** 双击命中节点时交给页面执行对应业务路由跳转。 */
  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const node = findNodeAtPointer(event.clientX, event.clientY);
      if (node) onNodeDoubleClick(node.id);
    },
    [findNodeAtPointer, onNodeDoubleClick],
  );

  /** 提供不依赖鼠标的缩放、适配和取消选择快捷键。 */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        zoomBy(1.3);
      } else if (event.key === '-') {
        event.preventDefault();
        zoomBy(1 / 1.3);
      } else if (event.key === '0') {
        event.preventDefault();
        fitCanvas();
      } else if (event.key === 'Escape') {
        onNodeSelect(null);
      }
    },
    [fitCanvas, onNodeSelect, zoomBy],
  );

  return {
    commands: {
      fitCanvas,
      zoomIn: () => zoomBy(1.3),
      zoomOut: () => zoomBy(1 / 1.3),
      restartLayout,
      focusNode,
    },
    onPointerMove,
    onPointerLeave,
    onClick,
    onDoubleClick,
    onKeyDown,
  };
}
