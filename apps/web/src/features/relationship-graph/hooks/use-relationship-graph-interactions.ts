/**
 * 本文件集中管理关系图谱 Canvas 的缩放、拖拽、指针命中和键盘交互，避免主 Hook 混入事件安装细节。
 */

'use client';

import * as d3 from 'd3';
import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react';

import type { RelationshipGraphSimulationNode } from '../types/relationship-graph-canvas.types';

/** D3 拖拽行为使用的节点主体。 */
type RelationshipGraphDragSubject = {
  /** 当前被拖拽的真实 D3 节点。 */
  node: RelationshipGraphSimulationNode;
  /** D3 drag 使用的屏幕横坐标。 */
  x: number;
  /** D3 drag 使用的屏幕纵坐标。 */
  y: number;
};

/** 关系图谱交互 Hook 所需的运行时 Ref、命令与页面回调。 */
type UseRelationshipGraphInteractionsOptions = {
  /** 当前关系图谱 Canvas。 */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 当前 D3 力模拟。 */
  simulationRef: MutableRefObject<d3.Simulation<RelationshipGraphSimulationNode, undefined> | null>;
  /** 当前 Canvas 安装的 D3 zoom 行为。 */
  zoomBehaviorRef: MutableRefObject<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>;
  /** 当前缩放和平移变换。 */
  transformRef: MutableRefObject<d3.ZoomTransform>;
  /** 当前悬浮节点标识。 */
  hoveredNodeIdRef: MutableRefObject<string | null>;
  /** 当前拖拽节点标识。 */
  draggedNodeIdRef: MutableRefObject<string | null>;
  /** 最近一次指针操作是否发生了节点拖拽。 */
  draggedRecentlyRef: MutableRefObject<boolean>;
  /** 通过客户端坐标查询命中节点。 */
  findNodeAtPointer: (clientX: number, clientY: number) => RelationshipGraphSimulationNode | null;
  /** 平滑切换当前悬浮节点。 */
  transitionHoveredNode: (nodeId: string | null) => void;
  /** 请求下一帧重绘。 */
  requestDraw: () => void;
  /** 将全部节点适配到画布。 */
  fitCanvas: () => boolean;
  /** 按相对倍率缩放画布。 */
  zoomBy: (factor: number) => void;
  /** 同步页面当前选中节点。 */
  onNodeSelect: (nodeId: string | null) => void;
  /** 通知页面进入节点对应业务页面。 */
  onNodeDoubleClick: (nodeId: string) => void;
};

/** 直接绑定到 React Canvas 元素的事件回调。 */
type UseRelationshipGraphInteractionsResult = {
  /** 鼠标移动时更新悬浮节点。 */
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  /** 鼠标离开时清理悬浮节点。 */
  onPointerLeave: () => void;
  /** 单击节点或空白区域时同步选择。 */
  onClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  /** 双击节点时进入对应业务页面。 */
  onDoubleClick: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  /** 处理缩放、适配和取消选择快捷键。 */
  onKeyDown: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
};

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

/** 安装 D3 手势并返回 React Canvas 事件回调。 */
export function useRelationshipGraphInteractions({
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
}: UseRelationshipGraphInteractionsOptions): UseRelationshipGraphInteractionsResult {
  /** 安装 D3 zoom 与鼠标节点 drag，并让触控手势保留给缩放和平移。 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const zoomBehavior = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.08, 8])
      .filter((event) => {
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
  }, [
    canvasRef,
    draggedNodeIdRef,
    draggedRecentlyRef,
    findNodeAtPointer,
    requestDraw,
    simulationRef,
    transformRef,
    transitionHoveredNode,
    zoomBehaviorRef,
  ]);

  /** 指针移动时借助四叉树更新鼠标样式和邻接高亮。 */
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (event.pointerType === 'touch' || draggedNodeIdRef.current) return;
      const node = findNodeAtPointer(event.clientX, event.clientY);
      const nextId = node?.id ?? null;
      if (nextId === hoveredNodeIdRef.current) return;
      transitionHoveredNode(nextId);
      if (canvasRef.current) canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
    },
    [canvasRef, draggedNodeIdRef, findNodeAtPointer, hoveredNodeIdRef, transitionHoveredNode],
  );

  /** 指针离开画布后清理悬停关系高亮。 */
  const onPointerLeave = useCallback(() => {
    if (draggedNodeIdRef.current) return;
    transitionHoveredNode(null);
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, [canvasRef, draggedNodeIdRef, transitionHoveredNode]);

  /** 单击命中节点时打开详情，单击空白时清理选中。 */
  const onClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (draggedRecentlyRef.current) return;
      onNodeSelect(findNodeAtPointer(event.clientX, event.clientY)?.id ?? null);
    },
    [draggedRecentlyRef, findNodeAtPointer, onNodeSelect],
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

  return { onPointerMove, onPointerLeave, onClick, onDoubleClick, onKeyDown };
}
