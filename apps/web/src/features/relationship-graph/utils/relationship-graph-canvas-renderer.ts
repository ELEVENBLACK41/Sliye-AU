/**
 * 本文件集中处理关系图谱 Canvas 的主题解析、节点尺寸和分层绘制，避免生命周期 Hook 承担像素渲染细节。
 */

import * as d3 from 'd3';

import type {
  RelationshipGraphCanvasTheme,
  RelationshipGraphSimulationEdge,
  RelationshipGraphSimulationNode,
} from '../types/relationship-graph-canvas.types';
import type { RelationshipGraphSettings } from '../types/relationship-graph-settings.types';

/** 单帧关系图谱绘制所需的稳定数据和交互状态。 */
type DrawRelationshipGraphFrameOptions = {
  /** 当前 Canvas 二维绘制上下文。 */
  context: CanvasRenderingContext2D;
  /** Canvas 的 CSS 像素宽度。 */
  width: number;
  /** Canvas 的 CSS 像素高度。 */
  height: number;
  /** 当前设备像素倍率。 */
  pixelRatio: number;
  /** 当前 D3 缩放和平移变换。 */
  transform: d3.ZoomTransform;
  /** 当前模拟中的全部可见节点。 */
  nodes: readonly RelationshipGraphSimulationNode[];
  /** 当前模拟中的全部可见关系边。 */
  edges: readonly RelationshipGraphSimulationEdge[];
  /** 节点标识到运行时节点的索引。 */
  nodeById: ReadonlyMap<string, RelationshipGraphSimulationNode>;
  /** 节点标识到连接度的索引。 */
  degreeById: ReadonlyMap<string, number>;
  /** 节点标识到直接相邻节点的索引。 */
  adjacency: ReadonlyMap<string, ReadonlySet<string>>;
  /** 当前主题下可直接绘制的颜色。 */
  theme: RelationshipGraphCanvasTheme;
  /** 当前图谱外观设置。 */
  settings: RelationshipGraphSettings;
  /** 当前选中的节点标识。 */
  selectedNodeId: string | null;
  /** 当前悬浮的节点标识。 */
  hoveredNodeId: string | null;
  /** 当前拖拽的节点标识。 */
  draggedNodeId: string | null;
  /** 当前搜索命中的节点集合。 */
  searchMatchIds: ReadonlySet<string>;
  /** 颜色规则解析后的节点颜色。 */
  resolvedNodeColors: ReadonlyMap<string, string>;
  /** 各节点当前的悬浮补间进度。 */
  hoverProgressByNodeId: ReadonlyMap<string, number>;
  /** 当前选中状态的缓动进度。 */
  selectionProgress: number;
};

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

/** 读取当前明暗主题下的图谱色板，不在业务样式中固化颜色。 */
export function readRelationshipGraphCanvasTheme(): RelationshipGraphCanvasTheme {
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
export function getRelationshipGraphNodeRadius(
  node: RelationshipGraphSimulationNode,
  degree: number,
  nodeSizeScale: number,
): number {
  const typeScale = node.type === 'PROJECT' ? 1.45 : node.type === 'USER' ? 1.2 : 1;
  return (4.2 + Math.min(Math.sqrt(degree) * 1.15, 5.5)) * typeScale * nodeSizeScale;
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
export function resolveRelationshipGraphCanvasColor(candidate: string, fallback: string): string {
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

/** 绘制当前关系图谱的一帧完整像素内容。 */
export function drawRelationshipGraphFrame({
  context,
  width,
  height,
  pixelRatio,
  transform,
  nodes,
  edges,
  nodeById,
  degreeById,
  adjacency,
  theme,
  settings,
  selectedNodeId,
  hoveredNodeId,
  draggedNodeId,
  searchMatchIds,
  resolvedNodeColors,
  hoverProgressByNodeId,
  selectionProgress,
}: DrawRelationshipGraphFrameOptions): void {
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = theme.backgroundColor;
  context.fillRect(0, 0, width, height);

  context.save();
  context.translate(transform.x, transform.y);
  context.scale(transform.k, transform.k);

  const activeNodeId = draggedNodeId ?? selectedNodeId;
  let hoverProgress = 0;
  for (const progress of hoverProgressByNodeId.values()) {
    hoverProgress = Math.min(1, hoverProgress + progress);
  }
  const searchIsActive = searchMatchIds.size < nodes.length;
  const hoverLayerNodeIds = new Set<string>();
  if (hoveredNodeId) hoverLayerNodeIds.add(hoveredNodeId);
  if (draggedNodeId) hoverLayerNodeIds.add(draggedNodeId);
  for (const [nodeId, progress] of hoverProgressByNodeId) {
    if (progress > 0.001) hoverLayerNodeIds.add(nodeId);
  }
  const relatedHoverNodeIds = new Set<string>();
  for (const nodeId of hoverLayerNodeIds) {
    relatedHoverNodeIds.add(nodeId);
    for (const neighborId of adjacency.get(nodeId) ?? []) {
      relatedHoverNodeIds.add(neighborId);
    }
  }

  for (const edge of edges) {
    const source = getEndpointNode(edge.source, nodeById);
    const target = getEndpointNode(edge.target, nodeById);
    if (!source || !target) continue;

    const touchesActive = !activeNodeId || source.id === activeNodeId || target.id === activeNodeId;
    const touchesSelectedNode =
      Boolean(selectedNodeId) && (source.id === selectedNodeId || target.id === selectedNodeId);
    const touchesSearch = !searchIsActive || searchMatchIds.has(source.id) || searchMatchIds.has(target.id);
    const opacity = (touchesActive ? 0.62 : 0.08) * (touchesSearch ? 1 : 0.22);
    const lineWidth = (0.55 + Math.min(edge.weight, 5) * 0.28) * settings.appearance.linkWidthScale;

    context.globalAlpha = opacity;
    const linkHighlightProgress = Math.min(1, touchesSelectedNode ? selectionProgress : 0);
    const linkColor = d3.interpolateRgb(theme.linkColor, theme.linkHighlightColor)(linkHighlightProgress);
    context.strokeStyle = linkColor;
    context.fillStyle = linkColor;
    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(source.x ?? 0, source.y ?? 0);
    context.lineTo(target.x ?? 0, target.y ?? 0);
    context.stroke();

    if (settings.appearance.showArrows && edge.directed) {
      const targetHighlightProgress = Math.max(
        target.id === selectedNodeId ? selectionProgress : 0,
        hoverProgressByNodeId.get(target.id) ?? 0,
      );
      const targetRadius =
        getRelationshipGraphNodeRadius(target, degreeById.get(target.id) ?? 0, settings.appearance.nodeSizeScale) *
        (1 + targetHighlightProgress * 0.12);
      drawRelationshipGraphArrow(context, source, target, targetRadius, lineWidth);
    }
  }

  /** 按当前帧状态绘制单个节点及文字，供底层与顶层节点复用。 */
  const drawNode = (node: RelationshipGraphSimulationNode): void => {
    const isSelected = node.id === selectedNodeId;
    const nodeHoverProgress = hoverProgressByNodeId.get(node.id) ?? 0;
    const isHovered = node.id === hoveredNodeId || nodeHoverProgress > 0.01;
    const matchesSearch = searchMatchIds.has(node.id);
    const nodeOpacity = matchesSearch ? 1 : 0.16;
    const baseRadius = getRelationshipGraphNodeRadius(
      node,
      degreeById.get(node.id) ?? 0,
      settings.appearance.nodeSizeScale,
    );
    const radius = baseRadius * (1 + Math.max(isSelected ? selectionProgress : 0, nodeHoverProgress) * 0.12);
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    context.globalAlpha = nodeOpacity;
    const defaultNodeColor = theme.nodeColors[node.type];
    const nodeColor = resolvedNodeColors.get(node.id) ?? defaultNodeColor;
    const selectedHighlightProgress = isSelected ? selectionProgress * (1 - hoverProgress) : 0;
    const selectedNodeColor = d3.interpolateRgb(nodeColor, theme.linkHighlightColor)(selectedHighlightProgress);
    let relatedHoverProgress = nodeHoverProgress;
    for (const neighborId of adjacency.get(node.id) ?? []) {
      relatedHoverProgress = Math.max(relatedHoverProgress, hoverProgressByNodeId.get(neighborId) ?? 0);
    }
    const whitenProgress = Math.max(0, hoverProgress - relatedHoverProgress) * 0.68;
    const whitenedNodeColor = d3.interpolateRgb(selectedNodeColor, theme.backgroundColor)(whitenProgress);
    context.fillStyle = d3.interpolateRgb(whitenedNodeColor, theme.linkHighlightColor)(nodeHoverProgress);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    if (isSelected || isHovered || node.isCurrentUser) {
      const focusProgress = Math.max(isSelected ? selectionProgress : 0, nodeHoverProgress, node.isCurrentUser ? 1 : 0);
      context.globalAlpha = (matchesSearch ? 0.95 : 0.35) * focusProgress;
      context.strokeStyle = isSelected || nodeHoverProgress > 0 ? theme.linkHighlightColor : theme.focusColor;
      context.lineWidth = 1.4 + Math.max(selectionProgress, nodeHoverProgress) * 0.8;
      context.beginPath();
      context.arc(x, y, radius + 2.5 + focusProgress * 1.5, 0, Math.PI * 2);
      context.stroke();
    }

    const labelRevealProgress = getRelationshipGraphLabelRevealProgress(transform.k);
    const shouldDrawLabel =
      settings.appearance.labelOpacity > 0 &&
      (isSelected || isHovered || node.isCurrentUser || labelRevealProgress > 0.01);
    if (!shouldDrawLabel) return;

    context.globalAlpha =
      nodeOpacity *
      (isSelected || isHovered || node.isCurrentUser
        ? Math.max(settings.appearance.labelOpacity, 0.82)
        : settings.appearance.labelOpacity * labelRevealProgress);
    context.fillStyle = d3.interpolateRgb(theme.labelColor, theme.backgroundColor)(whitenProgress);
    const labelSize = 11 / Math.pow(Math.max(transform.k, 0.25), 0.18);
    context.font = `${labelSize}px ui-sans-serif, system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillText(truncateRelationshipGraphLabel(node.title), x, y + radius + 5, 170);
  };

  for (const node of nodes) {
    if (!relatedHoverNodeIds.has(node.id)) drawNode(node);
  }

  if (hoverLayerNodeIds.size > 0) {
    for (const edge of edges) {
      const source = getEndpointNode(edge.source, nodeById);
      const target = getEndpointNode(edge.target, nodeById);
      if (!source || !target || (!hoverLayerNodeIds.has(source.id) && !hoverLayerNodeIds.has(target.id))) continue;

      const edgeHoverProgress = Math.max(
        hoverProgressByNodeId.get(source.id) ?? 0,
        hoverProgressByNodeId.get(target.id) ?? 0,
      );
      if (edgeHoverProgress <= 0.001) continue;
      const targetHighlightProgress = Math.max(
        target.id === selectedNodeId ? selectionProgress : 0,
        hoverProgressByNodeId.get(target.id) ?? 0,
      );
      const targetRadius =
        getRelationshipGraphNodeRadius(target, degreeById.get(target.id) ?? 0, settings.appearance.nodeSizeScale) *
        (1 + targetHighlightProgress * 0.12);
      const touchesSearch = !searchIsActive || searchMatchIds.has(source.id) || searchMatchIds.has(target.id);
      const lineWidth = (0.55 + Math.min(edge.weight, 5) * 0.28) * settings.appearance.linkWidthScale;

      context.globalAlpha = 0.62 * edgeHoverProgress * (touchesSearch ? 1 : 0.22);
      context.strokeStyle = theme.linkHighlightColor;
      context.fillStyle = theme.linkHighlightColor;
      context.lineWidth = lineWidth;
      context.beginPath();
      context.moveTo(source.x ?? 0, source.y ?? 0);
      context.lineTo(target.x ?? 0, target.y ?? 0);
      context.stroke();

      if (settings.appearance.showArrows && edge.directed) {
        drawRelationshipGraphArrow(context, source, target, targetRadius, lineWidth);
      }
    }
  }

  for (const node of nodes) {
    if (relatedHoverNodeIds.has(node.id)) drawNode(node);
  }

  context.restore();
  context.globalAlpha = 1;
}
