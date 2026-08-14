/**
 * 本文件管理关系图谱 Canvas 的尺寸提交、缩放变换、自动适配和节点聚焦，不包含业务绘制与力模拟。
 */

'use client';

import * as d3 from 'd3';
import { useCallback, type MutableRefObject, type RefObject } from 'react';

import type { RelationshipGraphSimulationNode } from '../types/relationship-graph-canvas.types';

/** Canvas 已提交或等待提交的像素尺寸。 */
export type RelationshipGraphCanvasSize = {
  /** CSS 像素宽度。 */
  width: number;
  /** CSS 像素高度。 */
  height: number;
  /** 设备像素倍率。 */
  pixelRatio: number;
};

/** 主 Hook 与视口 Hook 共享的可变 D3 视口状态。 */
export type RelationshipGraphViewportState = {
  /** 当前 Canvas 安装的 D3 zoom 行为。 */
  zoomBehaviorRef: MutableRefObject<d3.ZoomBehavior<HTMLCanvasElement, unknown> | null>;
  /** 当前画布缩放和平移变换。 */
  transformRef: MutableRefObject<d3.ZoomTransform>;
  /** 已提交到 Canvas 像素缓冲区的尺寸。 */
  sizeRef: MutableRefObject<RelationshipGraphCanvasSize>;
  /** 下一绘制帧需要提交的最新尺寸。 */
  pendingSizeRef: MutableRefObject<RelationshipGraphCanvasSize | null>;
};

/** 视口 Hook 所需的 Canvas、节点索引和绘制调度器。 */
type UseRelationshipGraphViewportOptions = {
  /** 当前关系图谱 Canvas。 */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** 当前模拟中的全部节点。 */
  nodesRef: MutableRefObject<RelationshipGraphSimulationNode[]>;
  /** 节点标识到运行时节点的索引。 */
  nodeByIdRef: MutableRefObject<Map<string, RelationshipGraphSimulationNode>>;
  /** 共享视口状态。 */
  viewport: RelationshipGraphViewportState;
};

/** 视口 Hook 返回的适配、缩放和节点聚焦命令。 */
type UseRelationshipGraphViewportResult = {
  /** 将全部节点缩放并居中到可视区域。 */
  fitCanvas: () => boolean;
  /** 按相对倍率缩放当前画布。 */
  zoomBy: (factor: number) => void;
  /** 将指定节点平移到画布中心。 */
  focusNode: (nodeId: string) => void;
};

/** 在绘制帧开始时提交最新尺寸，并补偿宽高变化造成的视觉中心偏移。 */
export function commitRelationshipGraphCanvasSize(
  canvas: HTMLCanvasElement,
  viewport: RelationshipGraphViewportState,
): void {
  const pendingSize = viewport.pendingSizeRef.current;
  if (!pendingSize) return;

  viewport.pendingSizeRef.current = null;
  const previousSize = viewport.sizeRef.current;
  const sizeChanged =
    pendingSize.width !== previousSize.width ||
    pendingSize.height !== previousSize.height ||
    pendingSize.pixelRatio !== previousSize.pixelRatio;
  if (!sizeChanged) return;

  canvas.width = Math.round(pendingSize.width * pendingSize.pixelRatio);
  canvas.height = Math.round(pendingSize.height * pendingSize.pixelRatio);
  viewport.sizeRef.current = pendingSize;

  const isInitialMeasurement = previousSize.width === 0 || previousSize.height === 0;
  const nextTransform = isInitialMeasurement
    ? d3.zoomIdentity.translate(pendingSize.width / 2, pendingSize.height / 2)
    : d3.zoomIdentity
        .translate(
          viewport.transformRef.current.x + (pendingSize.width - previousSize.width) / 2,
          viewport.transformRef.current.y + (pendingSize.height - previousSize.height) / 2,
        )
        .scale(viewport.transformRef.current.k);
  const zoomBehavior = viewport.zoomBehaviorRef.current;
  if (zoomBehavior) d3.select(canvas).call(zoomBehavior.transform, nextTransform);
  else viewport.transformRef.current = nextTransform;
}

/** 提供画布适配、相对缩放和节点聚焦命令。 */
export function useRelationshipGraphViewport({
  canvasRef,
  nodesRef,
  nodeByIdRef,
  viewport,
}: UseRelationshipGraphViewportOptions): UseRelationshipGraphViewportResult {
  /** 根据当前节点边界生成适配画布的缩放变换。 */
  const fitCanvas = useCallback((): boolean => {
    const canvas = canvasRef.current;
    const zoomBehavior = viewport.zoomBehaviorRef.current;
    const nodes = nodesRef.current;
    const { width, height } = viewport.sizeRef.current;
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
    const selection = d3.select(canvas);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      selection.call(zoomBehavior.transform, transform);
    } else {
      selection.transition().duration(280).call(zoomBehavior.transform, transform);
    }
    return true;
  }, [canvasRef, nodesRef, viewport]);

  /** 将缩放倍率按相对倍数平滑调整。 */
  const zoomBy = useCallback(
    (factor: number) => {
      const canvas = canvasRef.current;
      const zoomBehavior = viewport.zoomBehaviorRef.current;
      if (!canvas || !zoomBehavior) return;
      const selection = d3.select(canvas);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        selection.call(zoomBehavior.scaleBy, factor);
      } else {
        selection.transition().duration(180).call(zoomBehavior.scaleBy, factor);
      }
    },
    [canvasRef, viewport],
  );

  /** 将指定节点平移到当前画布中心并保留合理缩放。 */
  const focusNode = useCallback(
    (nodeId: string) => {
      const canvas = canvasRef.current;
      const zoomBehavior = viewport.zoomBehaviorRef.current;
      const node = nodeByIdRef.current.get(nodeId);
      const { width, height } = viewport.sizeRef.current;
      if (!canvas || !zoomBehavior || !node) return;

      const scale = Math.max(viewport.transformRef.current.k, 1.15);
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-(node.x ?? 0), -(node.y ?? 0));
      const selection = d3.select(canvas);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        selection.call(zoomBehavior.transform, transform);
      } else {
        selection.transition().duration(260).call(zoomBehavior.transform, transform);
      }
    },
    [canvasRef, nodeByIdRef, viewport],
  );

  return { fitCanvas, zoomBy, focusNode };
}
