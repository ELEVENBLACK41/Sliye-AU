/**
 * 本文件提供新版个人关系图谱的可聚焦 Canvas 组件，并向页面暴露布局控制命令。
 */

'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import type {
  RelationshipGraphNode,
  RelationshipGraphResponse,
} from '@workspace/contracts/relationship-graph';

import { useRelationshipGraphCanvas } from '../hooks/use-relationship-graph-canvas';
import type { RelationshipGraphCanvasHandle } from '../types/relationship-graph-canvas.types';
import type { RelationshipGraphSettings } from '../types/relationship-graph-settings.types';

/** 关系图谱画布的受控属性。 */
export type RelationshipGraphCanvasProps = {
  /** 已完成类型、人员和局部范围筛选的图谱快照。 */
  data: RelationshipGraphResponse;
  /** 当前浏览器内保存的外观和物理布局设置。 */
  settings: RelationshipGraphSettings;
  /** 当前展示详情的节点标识。 */
  selectedNodeId: string | null;
  /** 搜索命中的节点标识；画布保留完整拓扑并淡化其他节点。 */
  searchMatchIds: ReadonlySet<string>;
  /** 可视化颜色规则为节点解析出的运行时颜色。 */
  nodeColors: ReadonlyMap<string, string>;
  /** 单击节点或空白区域时更新页面选择状态。 */
  onNodeSelect: (nodeId: string | null) => void;
  /** 双击可跳转节点时通知页面进入对应业务页面。 */
  onNodeDoubleClick: (node: RelationshipGraphNode) => void;
};

/** 渲染由 D3 驱动、Canvas 绘制的关系图谱交互表面。 */
export const RelationshipGraphCanvas = forwardRef<
  RelationshipGraphCanvasHandle,
  RelationshipGraphCanvasProps
>(function RelationshipGraphCanvas(
  {
    data,
    settings,
    selectedNodeId,
    searchMatchIds,
    nodeColors,
    onNodeSelect,
    onNodeDoubleClick,
  },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodeById = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);

  /** 将 Hook 返回的节点标识转换成完整节点交给页面路由层。 */
  const handleNodeDoubleClick = (nodeId: string): void => {
    const node = nodeById.get(nodeId);
    if (node) onNodeDoubleClick(node);
  };

  const { commands, ...canvasEvents } = useRelationshipGraphCanvas({
    canvasRef,
    data,
    settings,
    selectedNodeId,
    searchMatchIds,
    nodeColors,
    onNodeSelect,
    onNodeDoubleClick: handleNodeDoubleClick,
  });

  useImperativeHandle(forwardedRef, () => commands, [commands]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`个人关系图谱，当前显示 ${data.nodes.length} 个节点和 ${data.edges.length} 条关系。可滚轮缩放、拖动画布、单击查看详情、双击进入业务页面。`}
      className="size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      role="application"
      tabIndex={0}
      {...canvasEvents}
    />
  );
});

RelationshipGraphCanvas.displayName = 'RelationshipGraphCanvas';
