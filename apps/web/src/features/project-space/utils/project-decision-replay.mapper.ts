/**
 * 本文件把项目内多项决策的真实事件转换为“决策如何形成”的 D3 回放链路。
 */
import type { DecisionEventTimelineItem, DecisionSummary } from '@workspace/contracts/decisions';
import type { DiscussionAreaSummary } from '@workspace/contracts/projects';

import type {
  DecisionReplayEvent,
  DecisionTreeNode,
  DecisionTreeRouteStatus,
} from '../types/project-space.type';
import {
  buildDecisionEntityTree,
  countDecisionEntityNodes,
  getDecisionCompletionEventId,
} from './project-decision-tree.mapper';

/** 单项决策及其已按权限读取的事件集合。 */
export type ProjectDecisionEventSource = {
  /** 决策摘要。 */
  decision: DecisionSummary;
  /** 当前决策的真实事件时间线。 */
  events: DecisionEventTimelineItem[];
};

/** 项目决策回放画布使用的树与全局事件序列。 */
export type ProjectDecisionReplayModel = {
  /** 项目到决策再到形成过程的语义链路。 */
  tree: DecisionTreeNode;
  /** 跨决策按发生时间合并后的可回放事件。 */
  events: DecisionReplayEvent[];
};

/** 事件关联实体的真实名称索引。 */
type DecisionEntityLabels = {
  /** 提案主键到真实提案标题。 */
  proposals: Map<number, string>;
  /** 投票轮次主键到面向用户的业务名称。 */
  votes: Map<number, string>;
  /** 正式决议主键到真实决议标题。 */
  resolutions: Map<number, string>;
};

/** 当前图谱只展示能够解释决策如何形成的业务事件。 */
const decisionProcessEventTypes = new Set<DecisionEventTimelineItem['type']>([
  'DECISION_CREATED',
  'PROPOSAL_CREATED',
  'PROPOSAL_UPDATED',
  'VOTE_ROUND_CREATED',
  'VOTE_ROUND_OPENED',
  'VOTE_CAST',
  'VOTE_ROUND_CLOSED',
  'RESOLUTION_CREATED',
  'RESOLUTION_SUPERSEDED',
  'RESOLUTION_REVOKED',
]);

/** 将项目内多条事件时间线转换为去重后的统一过程模型。 */
export function buildProjectDecisionReplayModel(
  projectTitle: string,
  sources: ProjectDecisionEventSource[],
  areas: DiscussionAreaSummary[] = [],
): ProjectDecisionReplayModel {
  const normalizedSources = sources.map((source) => ({
    ...source,
    events: source.events.filter(isDecisionProcessEvent).toSorted(compareEventsByTime),
  }));
  const sourceByEventId = new Map<string, ProjectDecisionEventSource>();
  const rawEvents = normalizedSources
    .flatMap((source) =>
      selectDecisionReplayEvents(source.events).map((event) => {
        const replayId = createReplayEventId(event.id);
        sourceByEventId.set(replayId, source);
        return { event, replayId };
      }),
    )
    .toSorted((left, right) => compareEventsByTime(left.event, right.event));
  const labelsByDecisionId = new Map(
    normalizedSources.map((source) => [source.decision.id, buildEntityLabels(source.events)]),
  );
  const replayEvents = rawEvents.map(({ event, replayId }, index) => {
    const source = sourceByEventId.get(replayId);
    const labels = source ? labelsByDecisionId.get(source.decision.id) : undefined;
    return mapReplayEvent(event, replayId, index, source?.decision, labels);
  });
  const decisionNodes = normalizedSources.map(({ decision, events }) => {
    const entityNodes = buildDecisionEntityTree(events);
    const createdEvent = events.find((event) => event.type === 'DECISION_CREATED');
    const completionEventId = getDecisionCompletionEventId(events);
    return {
      id: `decision-${decision.id}`,
      appearanceEventId: createdEvent ? createReplayEventId(createdEvent.id) : undefined,
      type: 'decision' as const,
      title: decision.title,
      subtitle: `${getDecisionStatusText(decision.status)} · ${countDecisionEntityNodes(entityNodes)} 个过程实体`,
      routeStatus: mapDecisionRouteStatus(decision.status),
      detailEventId: createdEvent ? createReplayEventId(createdEvent.id) : completionEventId,
      completionEventId,
      children: entityNodes,
    };
  });
  const projectDecisionNodes = decisionNodes.filter((_, index) => normalizedSources[index]?.decision.scope === 'PROJECT');
  const areaDecisionGroups = buildAreaDecisionGroups(areas, normalizedSources, decisionNodes);

  return {
    events: replayEvents,
    tree: {
      id: `project-${sources[0]?.decision.projectId ?? 'empty'}`,
      type: 'project',
      title: projectTitle,
      subtitle: `${sources.length} 项决策 · ${replayEvents.length} 条形成事件`,
      routeStatus: 'neutral',
      children: [...projectDecisionNodes, ...areaDecisionGroups],
    },
  };
}

/** 把审计事件收敛为与 D3 实体和状态变化一致的回放步骤。 */
function selectDecisionReplayEvents(events: DecisionEventTimelineItem[]): DecisionEventTimelineItem[] {
  const selectedEvents: DecisionEventTimelineItem[] = [];
  const voteEvents = new Map<number, DecisionEventTimelineItem[]>();

  events.forEach((event) => {
    if (event.voteRoundId && event.type.startsWith('VOTE_')) {
      if (isResolutionCleanupEvent(event)) return;
      voteEvents.set(event.voteRoundId, [...(voteEvents.get(event.voteRoundId) ?? []), event]);
      return;
    }
    if (event.type === 'PROPOSAL_UPDATED') {
      if (isResolutionCleanupEvent(event)) return;
      const status = readString(event.after, 'status');
      if (status !== 'REJECTED' && status !== 'CANCELLED') return;
    }
    selectedEvents.push(event);
  });

  voteEvents.forEach((roundEvents) => {
    const representativeEvent =
      roundEvents.findLast((event) => event.type === 'VOTE_ROUND_CLOSED') ??
      roundEvents.findLast((event) => event.type === 'VOTE_ROUND_OPENED') ??
      roundEvents.find((event) => event.type === 'VOTE_ROUND_CREATED');
    if (representativeEvent) selectedEvents.push(representativeEvent);
  });

  return selectedEvents.toSorted(compareEventsByTime);
}

/** 判断事件是否只是形成正式决议时同步关闭其他候选路径的审计记录。 */
function isResolutionCleanupEvent(event: DecisionEventTimelineItem): boolean {
  return (
    (event.type === 'PROPOSAL_UPDATED' && event.title === '决议形成，取消其他提案') ||
    (event.type === 'VOTE_ROUND_CLOSED' && event.title === '决议形成，取消其他投票')
  );
}

/** 按真实讨论分区把小组级决策聚合到独立范围节点下。 */
function buildAreaDecisionGroups(
  areas: DiscussionAreaSummary[],
  sources: ProjectDecisionEventSource[],
  decisionNodes: DecisionTreeNode[],
): DecisionTreeNode[] {
  const groups = new Map<
    number,
    {
      name: string;
      departments: Set<string>;
      decisions: DecisionTreeNode[];
    }
  >();
  areas.forEach((area) => {
    if (area.type !== 'PRIVATE') return;
    groups.set(area.id, { name: area.name, departments: new Set(), decisions: [] });
  });
  sources.forEach((source, index) => {
    const area = source.decision.area;
    const decisionNode = decisionNodes[index];
    if (source.decision.scope !== 'AREA' || !area || !decisionNode) return;
    const current = groups.get(area.id) ?? { name: area.name, departments: new Set(), decisions: [] };
    current.departments.add(source.decision.department.name);
    current.decisions.push(decisionNode);
    groups.set(area.id, current);
  });
  return [...groups].map(([areaId, group]) => ({
    id: `area-${areaId}`,
    type: 'area',
    title: group.name,
    subtitle: group.departments.size
      ? `${[...group.departments].join('、')} · ${group.decisions.length} 项小组决策`
      : `${group.decisions.length} 项小组决策`,
    routeStatus: 'neutral',
    children: group.decisions,
  }));
}

/** 只保留能够解释决策形成过程的事件，排除实体创建和重复生命周期日志。 */
function isDecisionProcessEvent(event: DecisionEventTimelineItem): boolean {
  if (event.type === 'STATUS_CHANGED') {
    const targetStatus = readString(event.after, 'status');
    return targetStatus === 'CANCELLED' || targetStatus === 'ARCHIVED';
  }
  return decisionProcessEventTypes.has(event.type);
}

/** 按真实发生时间和事件主键稳定排序。 */
function compareEventsByTime(left: DecisionEventTimelineItem, right: DecisionEventTimelineItem): number {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.id - right.id;
}

/** 从创建事件快照建立提案和正式决议的真实标题索引。 */
function buildEntityLabels(events: DecisionEventTimelineItem[]): DecisionEntityLabels {
  const labels: DecisionEntityLabels = { proposals: new Map(), votes: new Map(), resolutions: new Map() };
  events.forEach((event) => {
    if (event.proposalId && event.type === 'PROPOSAL_CREATED') {
      labels.proposals.set(event.proposalId, readString(event.after, 'title') || '未命名提案');
    }
    if (event.resolutionId && event.type === 'RESOLUTION_CREATED') {
      labels.resolutions.set(event.resolutionId, readString(event.after, 'title') || '正式决议');
    }
  });
  buildVoteLabels(events, labels);
  return labels;
}

/** 按所属提案和真实先后顺序生成不暴露数据库主键的投票名称。 */
function buildVoteLabels(events: DecisionEventTimelineItem[], labels: DecisionEntityLabels): void {
  const voteRounds = new Map<number, DecisionEventTimelineItem[]>();
  events.forEach((event) => {
    if (!event.voteRoundId || !event.type.startsWith('VOTE_')) return;
    voteRounds.set(event.voteRoundId, [...(voteRounds.get(event.voteRoundId) ?? []), event]);
  });
  const orderedRounds = [...voteRounds.entries()].toSorted((left, right) =>
    compareEventsByTime(left[1][0]!, right[1][0]!),
  );
  const roundCountByOwner = new Map<string, number>();
  const currentSequenceByOwner = new Map<string, number>();

  orderedRounds.forEach(([, roundEvents]) => {
    const proposalId = roundEvents.find((event) => event.proposalId)?.proposalId;
    const ownerKey = proposalId ? `proposal-${proposalId}` : 'decision';
    roundCountByOwner.set(ownerKey, (roundCountByOwner.get(ownerKey) ?? 0) + 1);
  });
  orderedRounds.forEach(([voteRoundId, roundEvents]) => {
    const proposalId = roundEvents.find((event) => event.proposalId)?.proposalId;
    const ownerKey = proposalId ? `proposal-${proposalId}` : 'decision';
    const sequence = (currentSequenceByOwner.get(ownerKey) ?? 0) + 1;
    const totalRounds = roundCountByOwner.get(ownerKey) ?? 1;
    currentSequenceByOwner.set(ownerKey, sequence);
    const proposalTitle = proposalId ? labels.proposals.get(proposalId) : undefined;
    const baseTitle = proposalTitle ? `${proposalTitle} · 投票` : '方案投票';
    labels.votes.set(voteRoundId, totalRounds > 1 ? `${baseTitle}（第 ${sequence} 轮）` : baseTitle);
  });
}

/** 将后端事件转换为播放胶囊使用的展示事件。 */
function mapReplayEvent(
  event: DecisionEventTimelineItem,
  replayId: string,
  index: number,
  decision: DecisionSummary | undefined,
  labels: DecisionEntityLabels | undefined,
): DecisionReplayEvent {
  const decisionTitle = decision?.title || '未知决策';
  const scopeLabel = decision?.scope === 'AREA' ? decision.area?.name || '小组决策' : '项目级';
  const label = event.type === 'DECISION_CREATED' ? decisionTitle : buildEventLabel(event, labels);
  return {
    id: replayId,
    sequence: index + 1,
    scopeLabel,
    phase: mapEventPhase(event.type),
    timeLabel: formatEventTime(event.occurredAt),
    label,
    summary: `${scopeLabel} · ${decisionTitle}：${label}`,
    actor: event.actor?.name || (event.actor ? `用户 ${event.actor.id}` : '系统'),
    evidence: buildEventEvidence(event, labels),
  };
}

/** 根据事件类型和关联实体生成有业务含义的节点名称。 */
function buildEventLabel(event: DecisionEventTimelineItem, labels: DecisionEntityLabels | undefined): string {
  const proposalTitle = event.proposalId ? labels?.proposals.get(event.proposalId) : undefined;
  const resolutionTitle = event.resolutionId ? labels?.resolutions.get(event.resolutionId) : undefined;
  if (event.type === 'PROPOSAL_CREATED') return proposalTitle || event.title;
  if (event.type === 'PROPOSAL_UPDATED' && proposalTitle) return `${event.title} · ${proposalTitle}`;
  if (event.type.startsWith('VOTE_')) {
    return event.voteRoundId ? labels?.votes.get(event.voteRoundId) || '方案投票' : '方案投票';
  }
  if (event.type === 'RESOLUTION_CREATED') return resolutionTitle || event.title;
  if ((event.type === 'RESOLUTION_SUPERSEDED' || event.type === 'RESOLUTION_REVOKED') && resolutionTitle) {
    return `${event.title} · ${resolutionTitle}`;
  }
  return event.title;
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
  return '决策';
}

/** 根据决策当前状态映射决策主干状态。 */
function mapDecisionRouteStatus(status: DecisionSummary['status']): DecisionTreeRouteStatus {
  if (status === 'RESOLVED') return 'resolved';
  if (status === 'CANCELLED') return 'abandoned';
  return 'neutral';
}

/** 从关联实体和投票结果生成当前过程节点的证据摘要。 */
function buildEventEvidence(event: DecisionEventTimelineItem, labels: DecisionEntityLabels | undefined): string {
  if (event.type === 'VOTE_ROUND_CLOSED') {
    const result = readRecord(event.payload, 'result');
    const totalBallots = readNumber(result, 'totalBallots');
    const outcome = readString(result, 'outcome');
    if (totalBallots !== undefined) return `${totalBallots} 张选票 · ${getVoteOutcomeText(outcome)}`;
  }
  if (event.type === 'VOTE_ROUND_OPENED') return '投票进行中';
  if (event.type === 'VOTE_ROUND_CREATED') return '等待开启投票';
  const references = [
    event.proposalId ? labels?.proposals.get(event.proposalId) || '未命名提案' : null,
    event.voteRoundId ? labels?.votes.get(event.voteRoundId) || '方案投票' : null,
    event.resolutionId ? labels?.resolutions.get(event.resolutionId) || '正式决议' : null,
  ].filter((value): value is string => Boolean(value));
  return references.length ? references.join(' · ') : '已记录到决策事件时间线';
}

/** 从安全记录中读取字符串字段。 */
function readString(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

/** 从安全记录中读取数值字段。 */
function readNumber(record: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

/** 从安全记录中读取嵌套对象字段。 */
function readRecord(record: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** 返回投票统计结论的中文说明。 */
function getVoteOutcomeText(outcome: string | undefined): string {
  return { APPROVED: '投票通过', REJECTED: '投票未通过', TIED: '投票平票', QUORUM_NOT_MET: '未达到法定人数' }[
    outcome || ''
  ] || '结果已固化';
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
  return { DRAFT: '草稿', DISCUSSING: '讨论中', RESOLVED: '已决议', CANCELLED: '已取消', ARCHIVED: '已归档' }[
    status
  ];
}
