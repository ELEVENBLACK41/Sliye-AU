/**
 * 本文件把项目内多项决策的真实事件时间线转换为 D3 回放所需的展示模型。
 */
import type { DecisionEventTimelineItem, DecisionSummary } from '@workspace/contracts/decisions';

import type {
  DecisionReplayEvent,
  DecisionTreeNode,
  DecisionTreeNodeType,
  DecisionTreeRouteStatus,
} from '../types/project-space.type';

/** 单项决策及其已按权限读取的事件集合。 */
export type ProjectDecisionEventSource = {
  /** 决策摘要。 */
  decision: DecisionSummary;
  /** 当前决策的真实事件时间线。 */
  events: DecisionEventTimelineItem[];
};

/** 项目决策回放画布使用的树与全局事件序列。 */
export type ProjectDecisionReplayModel = {
  /** 项目到决策再到事件的真实层级树。 */
  tree: DecisionTreeNode;
  /** 跨决策按发生时间合并后的事件序列。 */
  events: DecisionReplayEvent[];
};

/** 将项目内多条时间线转换为统一且可播放的过程模型。 */
export function buildProjectDecisionReplayModel(
  projectTitle: string,
  sources: ProjectDecisionEventSource[],
): ProjectDecisionReplayModel {
  const sourceByEventId = new Map<string, ProjectDecisionEventSource>();
  const rawEvents = sources
    .flatMap((source) =>
      source.events.map((event) => {
        const replayId = createReplayEventId(event.id);
        sourceByEventId.set(replayId, source);
        return { event, replayId };
      }),
    )
    .sort((left, right) => Date.parse(left.event.occurredAt) - Date.parse(right.event.occurredAt));
  const replayEvents = rawEvents.map(({ event, replayId }, index) => {
    const source = sourceByEventId.get(replayId);
    return mapReplayEvent(event, replayId, index, source?.decision.title || '未知决策');
  });

  return {
    events: replayEvents,
    tree: {
      id: `project-${sources[0]?.decision.projectId ?? 'empty'}`,
      type: 'project',
      title: projectTitle,
      subtitle: `${sources.length} 项决策 · ${replayEvents.length} 条过程事件`,
      routeStatus: 'neutral',
      children: sources.map(({ decision, events }) => ({
        id: `decision-${decision.id}`,
        type: 'decision',
        title: decision.title,
        subtitle: `${getDecisionStatusText(decision.status)} · ${events.length} 条事件`,
        routeStatus: mapDecisionRouteStatus(decision.status),
        children: events.map((event) => mapTreeEventNode(event)),
      })),
    },
  };
}

/** 将后端事件转换为播放胶囊使用的展示事件。 */
function mapReplayEvent(
  event: DecisionEventTimelineItem,
  replayId: string,
  index: number,
  decisionTitle: string,
): DecisionReplayEvent {
  return {
    id: replayId,
    sequence: index + 1,
    phase: mapEventPhase(event.type),
    timeLabel: formatEventTime(event.occurredAt),
    label: event.title,
    summary: `${decisionTitle}：${event.title}`,
    actor: event.actor?.name || (event.actor ? `用户 ${event.actor.id}` : '系统'),
    evidence: buildEventEvidence(event),
  };
}

/** 将真实事件转换为决策树中的一个可回放节点。 */
function mapTreeEventNode(event: DecisionEventTimelineItem): DecisionTreeNode {
  const replayId = createReplayEventId(event.id);
  return {
    id: replayId,
    type: mapEventNodeType(event.type),
    title: event.title,
    subtitle: `${formatEventTime(event.occurredAt)} · ${event.actor?.name || '系统'}`,
    routeStatus: mapEventRouteStatus(event),
    detailEventId: replayId,
    completionEventId: isCompletionEvent(event.type) ? replayId : undefined,
    statusEventId: isStatusEvent(event.type) ? replayId : undefined,
  };
}

/** 为数据库事件生成不会与项目、决策节点冲突的稳定标识。 */
function createReplayEventId(eventId: number): string {
  return `event-${eventId}`;
}

/** 根据事件业务类型映射回放阶段。 */
function mapEventPhase(type: DecisionEventTimelineItem['type']): DecisionReplayEvent['phase'] {
  if (type.startsWith('PROPOSAL_')) return '提案';
  if (type.startsWith('VOTE_')) return '投票';
  if (type.startsWith('RESOLUTION_')) return '决议';
  if (type === 'STATUS_CHANGED') return '决策';
  return '决策';
}

/** 根据事件业务类型映射 D3 节点类型。 */
function mapEventNodeType(type: DecisionEventTimelineItem['type']): DecisionTreeNodeType {
  if (type.startsWith('PROPOSAL_')) return 'proposal';
  if (type.startsWith('RESOLUTION_')) return 'resolution';
  return 'decision';
}

/** 根据真实事件结果映射画布路径状态。 */
function mapEventRouteStatus(event: DecisionEventTimelineItem): DecisionTreeRouteStatus {
  if (event.type === 'RESOLUTION_REVOKED') return 'revoked';
  if (event.type === 'RESOLUTION_SUPERSEDED') return 'superseded';
  if (event.type === 'RESOLUTION_CREATED') return 'resolved';
  if (event.type === 'VOTE_ROUND_CLOSED') {
    const outcome = event.payload?.outcome;
    return outcome === 'APPROVED' ? 'resolved' : outcome ? 'rejected' : 'neutral';
  }
  if (event.type === 'PROPOSAL_UPDATED') {
    const status = event.after?.status;
    if (status === 'REJECTED') return 'rejected';
    if (status === 'CANCELLED') return 'abandoned';
    if (status === 'ACCEPTED') return 'resolved';
  }
  return 'neutral';
}

/** 根据决策当前状态映射决策主干状态。 */
function mapDecisionRouteStatus(status: DecisionSummary['status']): DecisionTreeRouteStatus {
  if (status === 'RESOLVED') return 'resolved';
  if (status === 'CANCELLED') return 'abandoned';
  return 'neutral';
}

/** 判断事件是否代表一条路径完成。 */
function isCompletionEvent(type: DecisionEventTimelineItem['type']): boolean {
  return type === 'RESOLUTION_CREATED' || type === 'RESOLUTION_REVOKED' || type === 'RESOLUTION_SUPERSEDED';
}

/** 判断事件是否改变了节点结果状态。 */
function isStatusEvent(type: DecisionEventTimelineItem['type']): boolean {
  return type === 'PROPOSAL_UPDATED' || type === 'VOTE_ROUND_CLOSED' || type.startsWith('RESOLUTION_');
}

/** 从事件关联主键生成不泄漏内部载荷的证据摘要。 */
function buildEventEvidence(event: DecisionEventTimelineItem): string {
  const references = [
    event.proposalId ? `提案 #${event.proposalId}` : null,
    event.voteRoundId ? `投票 #${event.voteRoundId}` : null,
    event.resolutionId ? `决议 #${event.resolutionId}` : null,
    event.meetingId ? `会议 #${event.meetingId}` : null,
  ].filter(Boolean);
  return references.length ? references.join(' · ') : '已记录到决策事件时间线';
}

/** 格式化回放轨道使用的事件时间。 */
function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

/** 返回决策当前状态的中文说明。 */
function getDecisionStatusText(status: DecisionSummary['status']): string {
  return {
    DRAFT: '草稿',
    DISCUSSING: '讨论中',
    RESOLVED: '已决议',
    CANCELLED: '已取消',
    ARCHIVED: '已归档',
  }[status];
}
