/**
 * 本文件实现新版个人关系图谱颜色组的上下文预计算、AND 条件匹配与首条规则优先解析。
 */

import type {
  RelationshipGraphNode,
  RelationshipGraphRelationType,
  RelationshipGraphResponse,
} from '@workspace/contracts/relationship-graph';

import type {
  RelationshipGraphColorContext,
  RelationshipGraphColorRule,
} from '../types/relationship-graph-settings.types';

/** 标准化用于状态、标题和项目名称匹配的用户文本。 */
function normalizeColorRuleText(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

/** 向指定节点的“我的关系”索引中追加一组关系，并自动去重。 */
function appendMyRelations(
  target: Map<string, Set<RelationshipGraphRelationType>>,
  nodeId: string,
  relations: readonly RelationshipGraphRelationType[],
): void {
  const currentRelations = target.get(nodeId) ?? new Set<RelationshipGraphRelationType>();
  for (const relation of relations) currentRelations.add(relation);
  target.set(nodeId, currentRelations);
}

/** 预计算项目标题以及每个节点与当前用户的直接关系，供批量绘制复用。 */
export function buildRelationshipGraphColorContext(
  data: RelationshipGraphResponse,
): RelationshipGraphColorContext {
  const currentUserNode = data.nodes.find(
    (node) => node.isCurrentUser || (node.type === 'USER' && node.entityId === data.currentUserId),
  );
  const projectTitleById = new Map<number, string>();
  const myRelationsByNodeId = new Map<string, Set<RelationshipGraphRelationType>>();

  for (const node of data.nodes) {
    if (node.type === 'PROJECT') projectTitleById.set(node.entityId, node.title);
  }

  if (currentUserNode) {
    for (const edge of data.edges) {
      if (edge.source === currentUserNode.id) {
        appendMyRelations(myRelationsByNodeId, edge.target, edge.relations);
      }
      if (edge.target === currentUserNode.id) {
        appendMyRelations(myRelationsByNodeId, edge.source, edge.relations);
      }
    }
  }

  return {
    currentUserNodeId: currentUserNode?.id ?? null,
    projectTitleById,
    myRelationsByNodeId,
  };
}

/** 判断节点是否满足一条启用颜色规则中的全部非空条件组。 */
export function matchesRelationshipGraphColorRule(
  node: RelationshipGraphNode,
  rule: RelationshipGraphColorRule,
  context: RelationshipGraphColorContext,
): boolean {
  if (!rule.enabled) return false;

  const { conditions } = rule;
  if (conditions.nodeTypes.length > 0 && !conditions.nodeTypes.includes(node.type)) return false;

  if (conditions.statuses.length > 0) {
    const normalizedStatus = normalizeColorRuleText(node.status ?? '');
    const matchesStatus = conditions.statuses.some(
      (status) => normalizeColorRuleText(status) === normalizedStatus,
    );
    if (!matchesStatus) return false;
  }

  if (conditions.projectIds.length > 0 || conditions.projectTitles.length > 0) {
    const projectId = node.type === 'PROJECT' ? node.entityId : node.projectId;
    const projectTitle = projectId === null ? '' : context.projectTitleById.get(projectId) ?? '';
    const matchesProjectId = projectId !== null && conditions.projectIds.includes(projectId);
    const normalizedProjectTitle = normalizeColorRuleText(projectTitle);
    const matchesProjectTitle = conditions.projectTitles.some(
      (title) => normalizeColorRuleText(title) === normalizedProjectTitle,
    );
    if (!matchesProjectId && !matchesProjectTitle) return false;
  }

  const normalizedKeyword = normalizeColorRuleText(conditions.titleKeyword);
  if (normalizedKeyword && !normalizeColorRuleText(node.title).includes(normalizedKeyword)) return false;

  if (conditions.myRelations.length > 0) {
    const nodeRelations = context.myRelationsByNodeId.get(node.id);
    const matchesMyRelation = conditions.myRelations.some((relation) => nodeRelations?.has(relation));
    if (!matchesMyRelation) return false;
  }

  return true;
}

/** 按设置面板顺序返回节点命中的第一条启用规则颜色，未命中时交由主题默认色处理。 */
export function resolveRelationshipGraphNodeColor(
  node: RelationshipGraphNode,
  rules: readonly RelationshipGraphColorRule[],
  context: RelationshipGraphColorContext,
  fallbackColor: string | null = null,
): string | null {
  const matchedRule = rules.find((rule) => matchesRelationshipGraphColorRule(node, rule, context));
  return matchedRule?.color ?? fallbackColor;
}

/** 一次性解析全部节点的自定义颜色，仅在命中规则时写入结果映射。 */
export function resolveRelationshipGraphNodeColors(
  data: RelationshipGraphResponse,
  rules: readonly RelationshipGraphColorRule[],
): Map<string, string> {
  const context = buildRelationshipGraphColorContext(data);
  const colors = new Map<string, string>();

  for (const node of data.nodes) {
    const color = resolveRelationshipGraphNodeColor(node, rules, context);
    if (color) colors.set(node.id, color);
  }

  return colors;
}

/** 将指定颜色规则移动到目标下标，并保持其他规则的相对顺序。 */
export function moveRelationshipGraphColorRule(
  rules: readonly RelationshipGraphColorRule[],
  ruleId: string,
  targetIndex: number,
): RelationshipGraphColorRule[] {
  const sourceIndex = rules.findIndex((rule) => rule.id === ruleId);
  if (sourceIndex < 0 || rules.length === 0) return [...rules];

  const nextRules = [...rules];
  const [movedRule] = nextRules.splice(sourceIndex, 1);
  if (!movedRule) return nextRules;
  const boundedTargetIndex = Math.max(0, Math.min(targetIndex, nextRules.length));
  nextRules.splice(boundedTargetIndex, 0, movedRule);
  return nextRules;
}
