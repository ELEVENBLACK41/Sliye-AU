/**
 * 本文件提供新版个人关系图谱的数据筛选、邻接索引、局部遍历与搜索排序纯函数。
 */

import type {
  RelationshipGraphEdge,
  RelationshipGraphNode,
  RelationshipGraphNodeType,
  RelationshipGraphResponse,
} from '@workspace/contracts/relationship-graph';

import type {
  RelationshipGraphFilterOptions,
  RelationshipGraphSettings,
} from '../types/relationship-graph-settings.types';
import { RELATIONSHIP_GRAPH_NODE_TYPES } from './relationship-graph-settings';

/** 构建包含全部节点类型键的数量统计。 */
function countRelationshipGraphNodes(
  nodes: readonly RelationshipGraphNode[],
): Record<RelationshipGraphNodeType, number> {
  const counts: Record<RelationshipGraphNodeType, number> = {
    PROJECT: 0,
    AREA: 0,
    DECISION: 0,
    MEETING: 0,
    PROPOSAL: 0,
    VOTE_ROUND: 0,
    RESOLUTION: 0,
    USER: 0,
  };

  for (const node of nodes) counts[node.type] += 1;
  return counts;
}

/** 只保留两个端点都存在于允许集合中的连线。 */
function filterRelationshipGraphEdges(
  edges: readonly RelationshipGraphEdge[],
  allowedNodeIds: ReadonlySet<string>,
): RelationshipGraphEdge[] {
  return edges.filter((edge) => allowedNodeIds.has(edge.source) && allowedNodeIds.has(edge.target));
}

/** 找出图数据中代表当前登录用户的用户节点。 */
function findCurrentUserGraphNode(data: RelationshipGraphResponse): RelationshipGraphNode | undefined {
  return data.nodes.find(
    (node) => node.isCurrentUser || (node.type === 'USER' && node.entityId === data.currentUserId),
  );
}

/** 构建无向邻接索引；可选节点集合同时用于初始化孤立节点并限制边范围。 */
export function buildRelationshipGraphAdjacency(
  edges: readonly RelationshipGraphEdge[],
  nodeIds?: Iterable<string>,
): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  const allowedNodeIds = nodeIds ? new Set(nodeIds) : null;

  if (allowedNodeIds) {
    for (const nodeId of allowedNodeIds) adjacency.set(nodeId, new Set());
  }

  for (const edge of edges) {
    if (allowedNodeIds && (!allowedNodeIds.has(edge.source) || !allowedNodeIds.has(edge.target))) continue;
    const sourceNeighbors = adjacency.get(edge.source) ?? new Set<string>();
    const targetNeighbors = adjacency.get(edge.target) ?? new Set<string>();
    sourceNeighbors.add(edge.target);
    targetNeighbors.add(edge.source);
    adjacency.set(edge.source, sourceNeighbors);
    adjacency.set(edge.target, targetNeighbors);
  }

  return adjacency;
}

/** 从中心节点开始按广度优先遍历，收集不超过指定层数的局部子图节点。 */
export function collectRelationshipGraphNeighborhood(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  focusedNodeId: string,
  depth: 1 | 2 | 3 | 4,
): Set<string> {
  if (!adjacency.has(focusedNodeId)) return new Set();

  const visited = new Set<string>([focusedNodeId]);
  let frontier = new Set<string>([focusedNodeId]);

  for (let level = 0; level < depth && frontier.size > 0; level += 1) {
    const nextFrontier = new Set<string>();
    for (const nodeId of frontier) {
      for (const neighborId of adjacency.get(nodeId) ?? []) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        nextFrontier.add(neighborId);
      }
    }
    frontier = nextFrontier;
  }

  return visited;
}

/** 计算当前用户自身、直接相连节点以及后端标注为当前用户直接参与的节点。 */
function collectDirectlyRelatedNodeIds(data: RelationshipGraphResponse): Set<string> {
  const directlyRelatedNodeIds = new Set<string>();
  const currentUserNode = findCurrentUserGraphNode(data);

  for (const node of data.nodes) {
    if (node.isCurrentUser || node.currentUserRole !== null) directlyRelatedNodeIds.add(node.id);
  }

  if (!currentUserNode) return directlyRelatedNodeIds;
  directlyRelatedNodeIds.add(currentUserNode.id);

  for (const edge of data.edges) {
    if (edge.source === currentUserNode.id) directlyRelatedNodeIds.add(edge.target);
    if (edge.target === currentUserNode.id) directlyRelatedNodeIds.add(edge.source);
  }

  return directlyRelatedNodeIds;
}

/**
 * 按节点类型、我的直接关系、局部邻接层数和孤立节点设置筛选图数据。
 * 搜索不会调用本函数裁剪拓扑，调用方应使用搜索函数仅调整匹配节点的视觉状态。
 */
export function filterRelationshipGraph(
  data: RelationshipGraphResponse,
  settings: Pick<RelationshipGraphSettings, 'filters'>,
  options: RelationshipGraphFilterOptions = {},
): RelationshipGraphResponse {
  const directlyRelatedNodeIds = settings.filters.onlyDirectlyRelatedToMe
    ? collectDirectlyRelatedNodeIds(data)
    : null;
  let nodes = data.nodes.filter(
    (node) =>
      settings.filters.enabledNodeTypes[node.type] &&
      (!directlyRelatedNodeIds || directlyRelatedNodeIds.has(node.id)),
  );
  let allowedNodeIds = new Set(nodes.map((node) => node.id));
  let edges = filterRelationshipGraphEdges(data.edges, allowedNodeIds);

  if (
    settings.filters.localGraphEnabled &&
    options.focusedNodeId &&
    allowedNodeIds.has(options.focusedNodeId)
  ) {
    const adjacency = buildRelationshipGraphAdjacency(edges, allowedNodeIds);
    const neighborhood = collectRelationshipGraphNeighborhood(
      adjacency,
      options.focusedNodeId,
      settings.filters.localGraphDepth,
    );
    nodes = nodes.filter((node) => neighborhood.has(node.id));
    allowedNodeIds = new Set(nodes.map((node) => node.id));
    edges = filterRelationshipGraphEdges(edges, allowedNodeIds);
  }

  if (!settings.filters.showOrphans) {
    const connectedNodeIds = new Set<string>();
    for (const edge of edges) {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    }
    nodes = nodes.filter((node) => connectedNodeIds.has(node.id));
    allowedNodeIds = new Set(nodes.map((node) => node.id));
    edges = filterRelationshipGraphEdges(edges, allowedNodeIds);
  }

  return {
    ...data,
    nodes,
    edges,
    counts: countRelationshipGraphNodes(nodes),
  };
}

/** 将可搜索文本标准化，保证中英文大小写和全半角输入能够稳定比较。 */
function normalizeRelationshipGraphSearchText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

/** 计算节点对指定搜索词的相关性，数值越小越优先，未命中返回正无穷。 */
function scoreRelationshipGraphNode(node: RelationshipGraphNode, normalizedQuery: string): number {
  const title = normalizeRelationshipGraphSearchText(node.title);
  const subtitle = normalizeRelationshipGraphSearchText(node.subtitle ?? '');
  const status = normalizeRelationshipGraphSearchText(node.status ?? '');
  const identifiers = `${node.id} ${node.entityId} ${node.projectId ?? ''} ${node.areaId ?? ''} ${
    node.decisionId ?? ''
  }`.toLocaleLowerCase('zh-CN');

  if (title === normalizedQuery) return 0;
  if (title.startsWith(normalizedQuery)) return 1;
  if (title.includes(normalizedQuery)) return 2;
  if (subtitle.includes(normalizedQuery)) return 3;
  if (status.includes(normalizedQuery)) return 4;
  if (identifiers.includes(normalizedQuery)) return 5;
  return Number.POSITIVE_INFINITY;
}

/** 判断单个节点是否匹配搜索词，供 Canvas 保留拓扑后淡化未匹配节点。 */
export function matchesRelationshipGraphNodeSearch(node: RelationshipGraphNode, query: string): boolean {
  const normalizedQuery = normalizeRelationshipGraphSearchText(query);
  if (!normalizedQuery) return true;
  return Number.isFinite(scoreRelationshipGraphNode(node, normalizedQuery));
}

/** 搜索节点并按标题相关性排序，空搜索词不返回候选列表。 */
export function searchRelationshipGraphNodes(
  nodes: readonly RelationshipGraphNode[],
  query: string,
  limit = 30,
): RelationshipGraphNode[] {
  const normalizedQuery = normalizeRelationshipGraphSearchText(query);
  if (!normalizedQuery || limit <= 0) return [];

  return nodes
    .map((node) => ({ node, score: scoreRelationshipGraphNode(node, normalizedQuery) }))
    .filter((match) => Number.isFinite(match.score))
    .sort(
      (left, right) =>
        left.score - right.score || left.node.title.localeCompare(right.node.title, 'zh-CN'),
    )
    .slice(0, limit)
    .map((match) => match.node);
}

/** 获取搜索匹配节点标识，空搜索词返回全部节点，便于直接驱动淡化状态。 */
export function getRelationshipGraphSearchMatchIds(
  nodes: readonly RelationshipGraphNode[],
  query: string,
): Set<string> {
  const normalizedQuery = normalizeRelationshipGraphSearchText(query);
  if (!normalizedQuery) return new Set(nodes.map((node) => node.id));
  return new Set(
    nodes
      .filter((node) => Number.isFinite(scoreRelationshipGraphNode(node, normalizedQuery)))
      .map((node) => node.id),
  );
}

/** 暴露完整节点类型顺序，供设置面板与统计列表保持一致。 */
export function getRelationshipGraphNodeTypes(): readonly RelationshipGraphNodeType[] {
  return RELATIONSHIP_GRAPH_NODE_TYPES;
}
