/**
 * 本文件把关系图谱节点映射到已经存在的新版业务页面，不引入旧 feature 依赖。
 */
import type { RelationshipGraphNode } from '@workspace/contracts/relationship-graph';

/** 返回节点对应的新版业务地址；用户节点暂时没有独立详情页。 */
export function getRelationshipGraphNodeHref(node: RelationshipGraphNode): string | null {
  if (node.type === 'USER') return null;

  if (node.type === 'PROJECT') {
    return createProjectHref(node.entityId);
  }

  if (node.type === 'AREA') {
    return node.projectId ? createProjectHref(node.projectId, node.entityId) : null;
  }

  if (node.type === 'MEETING') {
    return createMeetingHref(node);
  }

  const decisionId = node.type === 'DECISION' ? node.entityId : node.decisionId;
  if (!node.projectId || !decisionId) return null;

  const searchParams = new URLSearchParams({
    projectId: String(node.projectId),
    section: 'decisions',
    decisionId: String(decisionId),
  });
  if (node.areaId) searchParams.set('areaId', String(node.areaId));
  if (node.type !== 'DECISION') {
    searchParams.set('focusType', node.type.toLocaleLowerCase());
    searchParams.set('focusId', String(node.entityId));
  }
  return `/projects?${searchParams.toString()}`;
}

/** 生成会议中心可稳定解析的目标会议地址。 */
function createMeetingHref(node: RelationshipGraphNode): string {
  const isHistory =
    node.status === 'ENDED' ||
    node.status === 'CANCELLED' ||
    node.status === 'EXPIRED';
  const searchParams = new URLSearchParams({
    view: isHistory ? 'records' : 'schedule',
    meetingId: String(node.entityId),
  });
  if (!isHistory) searchParams.set('date', formatShanghaiDateKey(node.timestamp));
  return `/meetings?${searchParams.toString()}`;
}

/** 将会议业务时间转换成会议中心使用的上海日期键。 */
function formatShanghaiDateKey(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

/** 创建项目或讨论分区在新版项目空间中的稳定地址。 */
function createProjectHref(projectId: number, areaId?: number): string {
  const searchParams = new URLSearchParams({ projectId: String(projectId) });
  if (areaId) searchParams.set('areaId', String(areaId));
  return `/projects?${searchParams.toString()}`;
}
