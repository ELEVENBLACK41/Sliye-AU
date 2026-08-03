/**
 * 本文件使用 D3 树形布局回放一个项目下多项决策从提案投票到正式决议的形成路径。
 */
'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { hierarchy, select, tree, zoom, zoomIdentity } from 'd3';
import type { HierarchyPointLink, ZoomBehavior } from 'd3';
import { CheckCircle2, GitBranch, Radio, Vote } from 'lucide-react';

import { decisionReplayTree, replayEvents } from '../project-space.constants';
import type { DecisionTreeNode, DecisionTreeNodeType } from '../types/project-space.type';
import { Badge } from '@workspace/ui/components/badge';

/** 中央决策树画布的外部播放状态。 */
type DecisionMapCanvasProps = {
  /** 当前播放到的事件索引。 */
  currentIndex: number;
  /** 当前事件内部的播放进度。 */
  progress: number;
};

/** 暴露给画布上方工具栏的视口控制能力。 */
export type DecisionMapCanvasHandle = {
  /** 将当前关系树完整放入可视区域。 */
  fitCanvas: () => void;
  /** 放大关系画布。 */
  zoomIn: () => void;
  /** 缩小关系画布。 */
  zoomOut: () => void;
};

const TREE_VIEWBOX_WIDTH = 1200;
const TREE_VIEWBOX_HEIGHT = 940;
const TREE_OFFSET_X = 130;
const TREE_OFFSET_Y = 70;
const NODE_VERTICAL_GAP = 82;
const NODE_HORIZONTAL_GAP = 250;
const NODE_APPEAR_PROGRESS = 0.82;
/** 首次进入画布时项目根节点使用的放大倍率。 */
const INITIAL_ROOT_SCALE = 2.2;

/** 为不同业务层级返回稳定的节点尺寸。 */
function getNodeSize(type: DecisionTreeNodeType): { width: number; height: number } {
  if (type === 'project') return { width: 230, height: 76 };
  if (type === 'decision') return { width: 220, height: 70 };
  return { width: 210, height: 64 };
}

/** 生成从来源卡片右边缘到目标卡片左边缘的贝塞尔连线。 */
function buildTreeLinkPath(treeLink: HierarchyPointLink<DecisionTreeNode>): string {
  const sourceSize = getNodeSize(treeLink.source.data.type);
  const targetSize = getNodeSize(treeLink.target.data.type);
  const sourceX = treeLink.source.y + TREE_OFFSET_X + sourceSize.width / 2;
  const sourceY = treeLink.source.x + TREE_OFFSET_Y;
  const targetX = treeLink.target.y + TREE_OFFSET_X - targetSize.width / 2;
  const targetY = treeLink.target.x + TREE_OFFSET_Y;
  const middleX = sourceX + (targetX - sourceX) * 0.5;

  return `M ${sourceX} ${sourceY} C ${middleX} ${sourceY}, ${middleX} ${targetY}, ${targetX} ${targetY}`;
}

/** 允许键盘用户在树形画布上定位到指定回放节点。 */
function handleNodeKeyDown(
  event: React.KeyboardEvent<SVGGElement>,
  nodeId: string,
  isSelectable: boolean,
  onSelect: (nodeId: string) => void,
): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (!isSelectable) return;
  onSelect(nodeId);
}

/** 根据当前回放位置返回节点已经发生的最新可展示业务结果。 */
function getNodeDetailEventIndex(
  node: DecisionTreeNode,
  currentIndex: number,
  progress: number,
  eventIndexById: Map<string, number>,
): number {
  const availableEventIndex = progress >= NODE_APPEAR_PROGRESS ? currentIndex : currentIndex - 1;
  const resultEventIds = [node.detailEventId, node.statusEventId, node.completionEventId];

  for (const eventId of resultEventIds) {
    if (!eventId) continue;
    const resultIndex = eventIndexById.get(eventId);
    if (resultIndex !== undefined && resultIndex <= availableEventIndex) return resultIndex;
  }

  return eventIndexById.get(node.id) ?? 0;
}

/** 渲染 D3 决策树，并按照底部胶囊进度分层同时生长节点与连线。 */
export const DecisionMapCanvas = forwardRef<DecisionMapCanvasHandle, DecisionMapCanvasProps>(
function DecisionMapCanvas({ currentIndex, progress }, forwardedRef) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewportRef = useRef<SVGGElement | null>(null);
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const currentEvent = replayEvents[currentIndex] ?? replayEvents[0];
  const eventIndexById = useMemo(() => new Map(replayEvents.map((event, index) => [event.id, index])), []);
  const treeRoot = useMemo(() => {
    const root = hierarchy<DecisionTreeNode>(decisionReplayTree);
    const layoutRoot = tree<DecisionTreeNode>().nodeSize([NODE_VERTICAL_GAP, NODE_HORIZONTAL_GAP])(root);
    const minimumX = Math.min(...layoutRoot.descendants().map((node) => node.x));
    layoutRoot.each((node) => {
      node.x -= minimumX;
    });
    return layoutRoot;
  }, []);
  const treeLinks = useMemo(() => treeRoot.links(), [treeRoot]);
  const treeNodes = useMemo(() => treeRoot.descendants(), [treeRoot]);
  const selectedTreeNode = selectedNodeId
    ? treeNodes.find((treeNode) => treeNode.data.id === selectedNodeId)
    : undefined;
  const selectedDetailEventIndex = selectedTreeNode
    ? getNodeDetailEventIndex(selectedTreeNode.data, currentIndex, progress, eventIndexById)
    : null;
  const detailEvent = replayEvents[selectedDetailEventIndex ?? currentIndex] ?? currentEvent;

  /** 安装 D3 缩放行为，使鼠标拖动画布和滚轮缩放与工具栏共用同一视口状态。 */
  useEffect(() => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (!svg || !viewport) return;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.5])
      .on('zoom', (zoomEvent) => {
        select(viewport).attr('transform', zoomEvent.transform.toString());
      });

    zoomBehaviorRef.current = zoomBehavior;
    select(svg).call(zoomBehavior).on('dblclick.zoom', null);

    return () => {
      select(svg).on('.zoom', null);
      zoomBehaviorRef.current = null;
    };
  }, []);

  /** 按指定倍率围绕画布中心缩放。 */
  const zoomCanvasBy = useCallback((factor: number): void => {
    const svg = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svg || !zoomBehavior) return;
    select(svg).call(zoomBehavior.scaleBy, factor);
  }, []);

  /** 计算完整关系树边界并缩放到当前可视区域。 */
  const fitCanvas = useCallback((): void => {
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    if (!svg || !viewport || !zoomBehavior) return;

    const bounds = viewport.getBBox();
    if (!bounds.width || !bounds.height) return;
    const padding = 72;
    const scale = Math.min(
      (TREE_VIEWBOX_WIDTH - padding * 2) / bounds.width,
      (TREE_VIEWBOX_HEIGHT - padding * 2) / bounds.height,
      1.25,
    );
    const translateX = (TREE_VIEWBOX_WIDTH - bounds.width * scale) / 2 - bounds.x * scale;
    const translateY = (TREE_VIEWBOX_HEIGHT - bounds.height * scale) / 2 - bounds.y * scale;

    select(svg).call(
      zoomBehavior.transform,
      zoomIdentity.translate(translateX, translateY).scale(scale),
    );
  }, []);

  /** 向上方画布工具栏提供适应、放大和缩小操作。 */
  useImperativeHandle(
    forwardedRef,
    () => ({
      fitCanvas,
      zoomIn: () => zoomCanvasBy(1.2),
      zoomOut: () => zoomCanvasBy(1 / 1.2),
    }),
    [fitCanvas, zoomCanvasBy],
  );
  /** 使用 D3 按全局发生时间逐条画线，线抵达边框后直接显示完整节点。 */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const selection = select(svg);

    selection
      .selectAll<SVGGElement, unknown>('[data-tree-node]')
      .attr('visibility', function setNodeVisibility() {
        const eventIndex = Number(this.dataset.eventIndex);
        const isVisible = eventIndex < 0 || eventIndex < currentIndex || (eventIndex === currentIndex && progress >= NODE_APPEAR_PROGRESS);
        return isVisible ? 'visible' : 'hidden';
      });

    selection
      .selectAll<SVGPathElement, unknown>('[data-tree-link]')
      .each(function updateTreeLink() {
        const path = select(this);
        const eventIndex = Number(this.dataset.eventIndex);
        const completionIndex = Number(this.dataset.completionIndex);
        const statusIndex = Number(this.dataset.statusIndex);
        const routeStatus = this.dataset.routeStatus;
        const pathLength = this.getTotalLength();
        const revealProgress =
          eventIndex < currentIndex
            ? 1
            : eventIndex === currentIndex
              ? Math.min(progress / NODE_APPEAR_PROGRESS, 1)
              : 0;
        const completionReached =
          completionIndex < currentIndex ||
          (completionIndex === currentIndex && progress >= NODE_APPEAR_PROGRESS);
        const statusReached =
          statusIndex < currentIndex ||
          (statusIndex === currentIndex && progress >= NODE_APPEAR_PROGRESS);
        const isFinalResolutionPath =
          (routeStatus === 'resolved' || routeStatus === 'superseded' || routeStatus === 'revoked') &&
          completionReached &&
          !statusReached;
        const isInactiveResolutionPath =
          (routeStatus === 'superseded' || routeStatus === 'revoked') && statusReached;

        path
          .attr('visibility', revealProgress > 0 ? 'visible' : 'hidden')
          .attr(
            'stroke-dasharray',
            (routeStatus === 'abandoned' && completionReached) || isInactiveResolutionPath
              ? '6 5'
              : `${pathLength * revealProgress} ${pathLength}`,
          )
          .attr(
            'stroke',
            isFinalResolutionPath
              ? '#22a06b'
              : isInactiveResolutionPath
                ? '#8b8d87'
                : 'rgba(41,42,39,0.3)',
          )
          .attr('stroke-width', isFinalResolutionPath ? 3 : 1.5);
      });
  }, [currentIndex, progress]);

  /** 首次进入页面时仅定位项目根节点，后续回放不再改变用户的画布视口。 */
  useEffect(() => {
    const svg = svgRef.current;
    const zoomBehavior = zoomBehaviorRef.current;
    const rootNode = treeNodes[0];
    if (!svg || !zoomBehavior || !rootNode) return;

    const centerX = rootNode.y + TREE_OFFSET_X;
    const centerY = rootNode.x + TREE_OFFSET_Y;
    const translateX = TREE_VIEWBOX_WIDTH / 2 - centerX * INITIAL_ROOT_SCALE;
    const translateY = TREE_VIEWBOX_HEIGHT / 2 - centerY * INITIAL_ROOT_SCALE;

    select(svg).call(
      zoomBehavior.transform,
      zoomIdentity.translate(translateX, translateY).scale(INITIAL_ROOT_SCALE),
    );
  }, [treeNodes]);

  return (
    <section
      className="relative flex min-h-[50rem] min-w-0 flex-1 flex-col overflow-hidden bg-white/18 lg:min-h-0"
      aria-labelledby="d3-replay-title"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_58%_45%,rgba(34,160,107,0.07),transparent_42%)]"
        aria-hidden
      />

      <header className="relative z-10 flex flex-col gap-3 px-5 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border border-black/10 bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-black/58 shadow-none">
              {detailEvent.phase}
            </Badge>
            <span className="text-[11px] font-medium text-black/45">{detailEvent.timeLabel}</span>
            <span className="text-[10px] font-medium tracking-[0.14em] text-black/35">
              EVENT {String(detailEvent.sequence).padStart(2, '0')} / {String(replayEvents.length).padStart(2, '0')}
            </span>
            {selectedNodeId !== null ? (
              <button
                type="button"
                onClick={() => setSelectedNodeId(null)}
                className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 px-2 py-1 text-[10px] font-medium text-black/55 hover:bg-white"
              >
                <Radio className="size-3" aria-hidden />
                跟随回放
              </button>
            ) : null}
          </div>
          <h2 id="d3-replay-title" className="mt-2 text-xl font-semibold tracking-[-0.025em] text-[#292a27]">
            {detailEvent.label}
          </h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-black/50">{detailEvent.summary}</p>
        </div>

        <aside
          className="w-full shrink-0 rounded-2xl border border-black/[0.07] bg-white/58 px-3.5 py-3 shadow-sm shadow-black/[0.025] backdrop-blur-sm sm:w-52"
          aria-label="当前节点投票证据"
        >
          <div className="flex items-center gap-2 text-[10px] font-medium text-black/42">
            <Vote className="size-3.5" aria-hidden />
            {detailEvent.actor}
          </div>
          <div className="mt-2 flex items-start gap-2 text-[11px] leading-4 text-black/65">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#16885a]" aria-hidden />
            <span>{detailEvent.evidence}</span>
          </div>
        </aside>
      </header>

      <div className="relative z-10 mt-1 min-h-0 w-full flex-1 overflow-x-auto overscroll-x-contain">
        <div className="mx-auto h-full min-w-[62rem] px-3">
          <svg
            ref={svgRef}
            className="h-[48rem] w-full cursor-grab touch-none active:cursor-grabbing lg:h-full"
            viewBox={`0 0 ${TREE_VIEWBOX_WIDTH} ${TREE_VIEWBOX_HEIGHT}`}
            role="img"
            aria-label={`项目决策树，当前回放到${currentEvent.label}`}
          >
            <g ref={viewportRef}>
            <g aria-hidden>
              {treeLinks.map((treeLink) => {
                const eventIndex = eventIndexById.get(treeLink.target.data.id) ?? -1;
                const isLinkVisible =
                  eventIndex < currentIndex || (eventIndex === currentIndex && progress > 0);
                const completionIndex = treeLink.target.data.completionEventId
                  ? (eventIndexById.get(treeLink.target.data.completionEventId) ?? Number.POSITIVE_INFINITY)
                  : Number.POSITIVE_INFINITY;
                const statusIndex = treeLink.target.data.statusEventId
                  ? (eventIndexById.get(treeLink.target.data.statusEventId) ?? Number.POSITIVE_INFINITY)
                  : Number.POSITIVE_INFINITY;

                return (
                  <path
                    key={`${treeLink.source.data.id}-${treeLink.target.data.id}`}
                    data-tree-link
                    data-event-index={eventIndex}
                    data-completion-index={completionIndex}
                    data-status-index={statusIndex}
                    data-route-status={treeLink.target.data.routeStatus}
                    d={buildTreeLinkPath(treeLink)}
                    fill="none"
                    stroke="rgba(41,42,39,0.24)"
                    strokeLinecap="round"
                    visibility={isLinkVisible ? 'visible' : 'hidden'}
                  />
                );
              })}
            </g>

            <g>
              {treeNodes.map((treeNode) => {
                const eventIndex = eventIndexById.get(treeNode.data.id) ?? -1;
                const completionIndex = treeNode.data.completionEventId
                  ? (eventIndexById.get(treeNode.data.completionEventId) ?? Number.POSITIVE_INFINITY)
                  : Number.POSITIVE_INFINITY;
                const statusIndex = treeNode.data.statusEventId
                  ? (eventIndexById.get(treeNode.data.statusEventId) ?? Number.POSITIVE_INFINITY)
                  : Number.POSITIVE_INFINITY;
                const completionReached =
                  completionIndex < currentIndex ||
                  (completionIndex === currentIndex && progress >= NODE_APPEAR_PROGRESS);
                const statusReached =
                  statusIndex < currentIndex ||
                  (statusIndex === currentIndex && progress >= NODE_APPEAR_PROGRESS);
                const isResolvedPath = treeNode.data.routeStatus === 'resolved';
                const isRejectedPath = treeNode.data.routeStatus === 'rejected';
                const isRejectedResult = isRejectedPath && statusReached;
                const isAbandonedPath = treeNode.data.routeStatus === 'abandoned';
                const isSupersededPath = treeNode.data.routeStatus === 'superseded';
                const isRevokedPath = treeNode.data.routeStatus === 'revoked';
                const isInactiveResolution = (isSupersededPath || isRevokedPath) && statusReached;
                const isActiveResolution =
                  (isResolvedPath || isSupersededPath || isRevokedPath) &&
                  completionReached &&
                  !isInactiveResolution;
                const isVisible =
                  eventIndex < 0 || eventIndex < currentIndex || (eventIndex === currentIndex && progress >= NODE_APPEAR_PROGRESS);
                const isSelected = treeNode.data.id === selectedNodeId;
                const { width, height } = getNodeSize(treeNode.data.type);
                const x = treeNode.y + TREE_OFFSET_X;
                const y = treeNode.x + TREE_OFFSET_Y;

                return (
                  <g
                    key={treeNode.data.id}
                    data-tree-node
                    data-event-index={eventIndex}
                    transform={`translate(${x}, ${y})`}
                    visibility={isVisible ? 'visible' : 'hidden'}
                    pointerEvents={isVisible ? 'auto' : 'none'}
                    role="button"
                    tabIndex={0}
                    aria-label={
                      eventIndex < 0
                        ? `项目根节点：${treeNode.data.title}`
                        : `查看第 ${eventIndex + 1} 个事件：${treeNode.data.title}`
                    }
                    onClick={(mouseEvent) => {
                      mouseEvent.stopPropagation();
                      if (eventIndex >= 0) setSelectedNodeId(treeNode.data.id);
                    }}
                    onKeyDown={(keyboardEvent) =>
                      handleNodeKeyDown(
                        keyboardEvent,
                        treeNode.data.id,
                        eventIndex >= 0,
                        setSelectedNodeId,
                      )
                    }
                    className="cursor-pointer outline-none focus-visible:[&>rect]:stroke-[#292a27] focus-visible:[&>rect]:stroke-[3]"
                  >
                    <rect
                      x={-width / 2}
                      y={-height / 2}
                      width={width}
                      height={height}
                      rx={treeNode.data.type === 'project' ? 20 : 12}
                      fill={
                        treeNode.data.type === 'project'
                          ? '#30312e'
                          : isInactiveResolution
                            ? isRevokedPath
                              ? '#fff0f0'
                              : '#f0f0ec'
                          : isAbandonedPath && completionReached
                            ? '#f0f0ec'
                            : isRejectedResult
                              ? '#fff0f0'
                            : isActiveResolution
                                ? '#e9f8f1'
                                : treeNode.data.type === 'resolution'
                                  ? '#f4f4f0'
                                  : '#ffffff'
                      }
                      stroke={
                        isSelected
                          ? '#e7b200'
                          : isInactiveResolution
                          ? isRevokedPath
                            ? '#b65b5b'
                            : '#8b8d87'
                          : isAbandonedPath && completionReached
                          ? '#8b8d87'
                          : isRejectedResult
                            ? '#dc4c4c'
                            : isActiveResolution
                              ? '#22a06b'
                              : 'rgba(41,42,39,0.16)'
                      }
                      strokeWidth={isSelected ? 3 : isActiveResolution ? 2 : 1}
                    />
                    <text
                      y={-3}
                      textAnchor="middle"
                      className={`text-[14px] font-semibold ${treeNode.data.type === 'project' ? 'fill-white' : 'fill-[#292a27]'}`}
                    >
                      {treeNode.data.title}
                    </text>
                    <text
                      y={14}
                      textAnchor="middle"
                      className={`text-[10px] ${treeNode.data.type === 'project' ? 'fill-white/55' : isAbandonedPath || isSupersededPath ? 'fill-[#6d6f69]' : isRejectedResult || (isRevokedPath && statusReached) ? 'fill-[#b42323]' : 'fill-black/45'}`}
                    >
                      {treeNode.data.subtitle}
                    </text>
                  </g>
                );
              })}
            </g>
            </g>
          </svg>
        </div>
      </div>

      <div className="pointer-events-none absolute right-5 bottom-28 flex items-center gap-3 rounded-full border border-black/[0.06] bg-white/62 px-3 py-2 text-[9px] font-medium text-black/38 backdrop-blur-sm" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full border border-black/20 bg-white" />未发起投票</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#dc4c4c]" />投票拒绝</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#22a06b]" />正式决议路径</span>
        <span className="flex items-center gap-1.5"><span className="h-px w-3 border-t border-dashed border-black/45" />废弃或失效</span>
        <GitBranch className="size-3.5" />
      </div>
    </section>
  );
});

DecisionMapCanvas.displayName = 'DecisionMapCanvas';
