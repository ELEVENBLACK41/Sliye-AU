/**
 * 本文件将决策事件聚合为提案、投票轮次和正式决议实体，并按真实来源关系构建 D3 树。
 */
import type { DecisionEventTimelineItem } from '@workspace/contracts/decisions';

import type { DecisionTreeNode, DecisionTreeRouteStatus } from '../types/project-space.type';

/** 带发生时间的内部树节点，用于挂接后稳定排序。 */
type TimedTreeNode = {
  /** 对外展示的 D3 节点。 */
  node: DecisionTreeNode;
  /** 当前实体首次进入决策过程的时间。 */
  occurredAt: string;
  /** 当前实体下按来源关系挂接的子实体。 */
  children: TimedTreeNode[];
};

/** 将一项决策的事件日志聚合为不重复的领域实体树。 */
export function buildDecisionEntityTree(events: DecisionEventTimelineItem[]): DecisionTreeNode[] {
  const proposalNodes = buildProposalNodes(events);
  const voteNodes = buildVoteNodes(events, proposalNodes);
  const resolutionNodes = buildResolutionNodes(events);
  const rootNodes = [...proposalNodes.values()];

  voteNodes.forEach(({ treeNode, proposalId }) => {
    const parentProposal = proposalId ? proposalNodes.get(proposalId) : undefined;
    if (parentProposal) parentProposal.children.push(treeNode);
    else rootNodes.push(treeNode);
  });

  resolutionNodes.forEach(({ treeNode, sourceProposalId, sourceVoteRoundId }) => {
    const sourceVote = sourceVoteRoundId ? voteNodes.get(sourceVoteRoundId) : undefined;
    const parentVote = sourceVote?.treeNode;
    const parentProposal = sourceProposalId ? proposalNodes.get(sourceProposalId) : undefined;
    const completionEventId = treeNode.node.completionEventId;
    if (completionEventId) {
      if (parentVote) markResolvedPathNode(parentVote, completionEventId);
      const voteProposal = sourceVote?.proposalId ? proposalNodes.get(sourceVote.proposalId) : undefined;
      if (voteProposal) markResolvedPathNode(voteProposal, completionEventId);
      else if (parentProposal) markResolvedPathNode(parentProposal, completionEventId);
    }
    if (parentVote) parentVote.children.push(treeNode);
    else if (parentProposal) parentProposal.children.push(treeNode);
    else rootNodes.push(treeNode);
  });

  events.filter(isDecisionTerminalEvent).forEach((event) => rootNodes.push(buildTerminalNode(event)));
  return rootNodes.toSorted(compareTimedNodes).map(finalizeTreeNode);
}

/** 统计一组实体树节点的总数量。 */
export function countDecisionEntityNodes(nodes: DecisionTreeNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countDecisionEntityNodes(node.children ?? []), 0);
}

/** 返回当前决策首次形成正式决议时对应的回放事件标识。 */
export function getDecisionCompletionEventId(events: DecisionEventTimelineItem[]): string | undefined {
  const resolutionEvent = events
    .filter((event) => event.type === 'RESOLUTION_CREATED')
    .toSorted(compareEventsByTime)[0];
  if (resolutionEvent) return createReplayEventId(resolutionEvent.id);
  const terminalEvent = events.filter(isDecisionTerminalEvent).toSorted(compareEventsByTime)[0];
  return terminalEvent ? createReplayEventId(terminalEvent.id) : undefined;
}

/** 让正式决议的来源提案或投票在同一回放时刻进入完成态。 */
function markResolvedPathNode(timedNode: TimedTreeNode, completionEventId: string): void {
  timedNode.node.routeStatus = 'resolved';
  timedNode.node.completionEventId = completionEventId;
}

/** 提案节点及其业务主键索引。 */
function buildProposalNodes(events: DecisionEventTimelineItem[]): Map<number, TimedTreeNode> {
  const proposalEvents = groupEventsById(events, 'proposalId');
  return new Map(
    [...proposalEvents].map(([proposalId, groupedEvents]) => {
      const createdEvent = groupedEvents.find((event) => event.type === 'PROPOSAL_CREATED') ?? groupedEvents[0]!;
      const statusEvent = groupedEvents.findLast((event) => event.type === 'PROPOSAL_UPDATED');
      const status = readString(statusEvent?.after, 'status') || readString(createdEvent.after, 'status') || 'OPEN';
      const title =
        readString(createdEvent.after, 'title') ||
        readCreatedEntityTitle(createdEvent.title, '创建提案') ||
        '未命名提案';
      const statusReplayEventId = statusEvent ? getReplayStatusEventId(events, statusEvent) : undefined;
      return [
        proposalId,
        {
          occurredAt: createdEvent.occurredAt,
          children: [],
          node: {
            id: createReplayEventId(createdEvent.id),
            type: 'proposal',
            title,
            subtitle: `${getProposalStatusText(status)} · ${formatEventTime(createdEvent.occurredAt)}`,
            routeStatus: mapProposalRouteStatus(status),
            detailEventId: createReplayEventId(createdEvent.id),
            completionEventId:
              (status === 'ACCEPTED' || status === 'CANCELLED') && statusReplayEventId
                ? statusReplayEventId
                : undefined,
            statusEventId: statusReplayEventId,
          },
        },
      ];
    }),
  );
}

/** 投票节点及其来源提案索引。 */
function buildVoteNodes(
  events: DecisionEventTimelineItem[],
  proposalNodes: Map<number, TimedTreeNode>,
): Map<number, { treeNode: TimedTreeNode; proposalId: number | null }> {
  const voteEvents = groupEventsById(events, 'voteRoundId');
  const voteCountByProposal = countVotesByProposal(voteEvents);
  const voteSequenceByProposal = new Map<number | null, number>();
  return new Map(
    [...voteEvents].map(([voteRoundId, groupedEvents]) => {
      const createdEvent = groupedEvents.find((event) => event.type === 'VOTE_ROUND_CREATED') ?? groupedEvents[0]!;
      const openedEvent = groupedEvents.find((event) => event.type === 'VOTE_ROUND_OPENED');
      const closedEvent = groupedEvents.findLast((event) => event.type === 'VOTE_ROUND_CLOSED');
      const displayClosedEvent = closedEvent && !isResolutionCleanupEvent(closedEvent) ? closedEvent : undefined;
      const displayEvent = displayClosedEvent ?? openedEvent ?? createdEvent;
      const ballotCount = groupedEvents.filter((event) => event.type === 'VOTE_CAST').length;
      const proposalId = groupedEvents.find((event) => event.proposalId)?.proposalId ?? null;
      const routeStatus = mapVoteRouteStatus(closedEvent);
      const statusReplayEventId = closedEvent ? getReplayStatusEventId(events, closedEvent) : undefined;
      const voteSequence = (voteSequenceByProposal.get(proposalId) ?? 0) + 1;
      voteSequenceByProposal.set(proposalId, voteSequence);
      const proposalTitle = proposalId ? proposalNodes.get(proposalId)?.node.title : undefined;
      return [
        voteRoundId,
        {
          proposalId,
          treeNode: {
            occurredAt: displayEvent.occurredAt,
            children: [],
            node: {
              id: createReplayEventId(displayEvent.id),
              type: 'vote',
              title: buildVoteTitle(proposalTitle, voteCountByProposal.get(proposalId) ?? 1, voteSequence),
              subtitle: buildVoteSubtitle(openedEvent, closedEvent, ballotCount),
              routeStatus,
              detailEventId: createReplayEventId(displayEvent.id),
              completionEventId: routeStatus === 'abandoned' && statusReplayEventId ? statusReplayEventId : undefined,
              statusEventId: statusReplayEventId,
            },
          },
        },
      ];
    }),
  );
}

/** 统计每个提案实际发起的投票轮次数量。 */
function countVotesByProposal(voteEvents: Map<number, DecisionEventTimelineItem[]>): Map<number | null, number> {
  const counts = new Map<number | null, number>();
  voteEvents.forEach((events) => {
    const proposalId = events.find((event) => event.proposalId)?.proposalId ?? null;
    counts.set(proposalId, (counts.get(proposalId) ?? 0) + 1);
  });
  return counts;
}

/** 将决议形成时的自动关闭状态映射到正式决议事件，使相关节点同时完成状态动画。 */
function getReplayStatusEventId(events: DecisionEventTimelineItem[], statusEvent: DecisionEventTimelineItem): string {
  if (!isResolutionCleanupEvent(statusEvent)) return createReplayEventId(statusEvent.id);
  const resolutionEvent = events
    .filter((event) => event.type === 'RESOLUTION_CREATED' && event.id > statusEvent.id)
    .toSorted(compareEventsByTime)[0];
  return createReplayEventId((resolutionEvent ?? statusEvent).id);
}

/** 判断事件是否是正式决议形成时自动关闭其他候选路径的内部审计记录。 */
function isResolutionCleanupEvent(event: DecisionEventTimelineItem): boolean {
  return (
    (event.type === 'PROPOSAL_UPDATED' && event.title === '决议形成，取消其他提案') ||
    (event.type === 'VOTE_ROUND_CLOSED' && event.title === '决议形成，取消其他投票')
  );
}

/** 根据来源提案和轮次数量生成不暴露数据库主键的投票标题。 */
function buildVoteTitle(proposalTitle: string | undefined, totalRounds: number, sequence: number): string {
  const baseTitle = proposalTitle ? `${proposalTitle} · 投票` : '方案投票';
  return totalRounds > 1 ? `${baseTitle}（第 ${sequence} 轮）` : baseTitle;
}

/** 正式决议节点及其来源提案、投票索引。 */
function buildResolutionNodes(
  events: DecisionEventTimelineItem[],
): Array<{ treeNode: TimedTreeNode; sourceProposalId: number | null; sourceVoteRoundId: number | null }> {
  const resolutionEvents = groupEventsById(events, 'resolutionId');
  return [...resolutionEvents].flatMap(([, groupedEvents]) => {
    const createdEvent = groupedEvents.find((event) => event.type === 'RESOLUTION_CREATED');
    if (!createdEvent) return [];
    const statusEvent = groupedEvents.findLast(
      (event) => event.type === 'RESOLUTION_SUPERSEDED' || event.type === 'RESOLUTION_REVOKED',
    );
    const routeStatus: DecisionTreeRouteStatus =
      statusEvent?.type === 'RESOLUTION_REVOKED'
        ? 'revoked'
        : statusEvent?.type === 'RESOLUTION_SUPERSEDED'
          ? 'superseded'
          : 'resolved';
    return [
      {
        sourceProposalId: readNumber(createdEvent.payload, 'sourceProposalId') ?? createdEvent.proposalId ?? null,
        sourceVoteRoundId: readNumber(createdEvent.payload, 'sourceVoteRoundId') ?? createdEvent.voteRoundId ?? null,
        treeNode: {
          occurredAt: createdEvent.occurredAt,
          children: [],
          node: {
            id: createReplayEventId(createdEvent.id),
            type: 'resolution',
            title: readString(createdEvent.after, 'title') || createdEvent.title || '正式决议',
            subtitle: `${getResolutionKindText(readString(createdEvent.after, 'kind'))} · ${getResolutionStatusText(routeStatus)} · ${formatEventTime(createdEvent.occurredAt)}`,
            routeStatus,
            detailEventId: createReplayEventId((statusEvent ?? createdEvent).id),
            completionEventId: createReplayEventId(createdEvent.id),
            statusEventId: statusEvent ? createReplayEventId(statusEvent.id) : undefined,
          },
        },
      },
    ];
  });
}

/** 按关联主键把同一领域实体的事件合并并稳定排序。 */
function groupEventsById(
  events: DecisionEventTimelineItem[],
  key: 'proposalId' | 'voteRoundId' | 'resolutionId',
): Map<number, DecisionEventTimelineItem[]> {
  const groups = new Map<number, DecisionEventTimelineItem[]>();
  events.forEach((event) => {
    const id = event[key];
    if (!id) return;
    groups.set(id, [...(groups.get(id) ?? []), event]);
  });
  groups.forEach((groupedEvents) => groupedEvents.sort(compareEventsByTime));
  return groups;
}

/** 构造决策取消或归档的独立终止节点。 */
function buildTerminalNode(event: DecisionEventTimelineItem): TimedTreeNode {
  const replayId = createReplayEventId(event.id);
  return {
    occurredAt: event.occurredAt,
    children: [],
    node: {
      id: replayId,
      type: 'abandoned',
      title: event.title,
      subtitle: `${formatEventTime(event.occurredAt)} · ${event.actor?.name || '系统'}`,
      routeStatus: 'abandoned',
      detailEventId: replayId,
      completionEventId: replayId,
      statusEventId: replayId,
    },
  };
}

/** 判断状态事件是否代表决策取消或归档。 */
function isDecisionTerminalEvent(event: DecisionEventTimelineItem): boolean {
  if (event.type !== 'STATUS_CHANGED') return false;
  const status = readString(event.after, 'status');
  return status === 'CANCELLED' || status === 'ARCHIVED';
}

/** 将内部节点递归转换为最终 D3 节点。 */
function finalizeTreeNode(timedNode: TimedTreeNode): DecisionTreeNode {
  return {
    ...timedNode.node,
    children: timedNode.children.length
      ? timedNode.children.toSorted(compareTimedNodes).map(finalizeTreeNode)
      : undefined,
  };
}

/** 按实体进入过程的时间稳定排序。 */
function compareTimedNodes(left: TimedTreeNode, right: TimedTreeNode): number {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.node.id.localeCompare(right.node.id);
}

/** 按事件发生时间和主键稳定排序。 */
function compareEventsByTime(left: DecisionEventTimelineItem, right: DecisionEventTimelineItem): number {
  return Date.parse(left.occurredAt) - Date.parse(right.occurredAt) || left.id - right.id;
}

/** 根据关闭事件返回投票节点的最终路径状态。 */
function mapVoteRouteStatus(closedEvent: DecisionEventTimelineItem | undefined): DecisionTreeRouteStatus {
  if (!closedEvent) return 'neutral';
  if (readString(closedEvent.after, 'status') === 'CANCELLED') return 'abandoned';
  const outcome = readString(readRecord(closedEvent.payload, 'result'), 'outcome');
  // 投票通过只是形成正式决议的证据，只有被决议实际采用后才把来源路径标绿。
  return outcome === 'APPROVED' ? 'neutral' : outcome ? 'rejected' : 'neutral';
}

/** 根据投票生命周期和票数生成聚合节点说明。 */
function buildVoteSubtitle(
  openedEvent: DecisionEventTimelineItem | undefined,
  closedEvent: DecisionEventTimelineItem | undefined,
  ballotCount: number,
): string {
  if (!closedEvent) return openedEvent ? `投票中 · ${ballotCount} 人已投票` : '等待开启';
  if (readString(closedEvent.after, 'status') === 'CANCELLED') return `已取消 · ${ballotCount} 人已投票`;
  const result = readRecord(closedEvent.payload, 'result');
  const totalBallots = readNumber(result, 'totalBallots') ?? ballotCount;
  return `${getVoteOutcomeText(readString(result, 'outcome'))} · ${totalBallots} 张选票`;
}

/** 将提案状态映射为路径状态。 */
function mapProposalRouteStatus(status: string): DecisionTreeRouteStatus {
  if (status === 'ACCEPTED') return 'resolved';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'CANCELLED') return 'abandoned';
  return 'neutral';
}

/** 返回提案状态中文说明。 */
function getProposalStatusText(status: string): string {
  return { OPEN: '讨论中', ACCEPTED: '已采纳', REJECTED: '未采纳', CANCELLED: '已取消' }[status] || status;
}

/** 返回正式决议状态中文说明。 */
function getResolutionStatusText(status: DecisionTreeRouteStatus): string {
  if (status === 'resolved') return '当前有效';
  if (status === 'superseded') return '已被替代';
  if (status === 'revoked') return '已撤销';
  return '状态未知';
}

/** 返回决议用途类型，避免把阶段性结论误认为最终决议。 */
function getResolutionKindText(kind: string | undefined): string {
  return { INTERIM: '阶段性决议', FINAL: '最终决议', SUPPLEMENT: '补充决议' }[kind || ''] || '正式决议';
}

/** 返回投票统计结论中文说明。 */
function getVoteOutcomeText(outcome: string | undefined): string {
  return (
    { APPROVED: '投票通过', REJECTED: '投票未通过', TIED: '投票平票', QUORUM_NOT_MET: '未达到法定人数' }[
      outcome || ''
    ] || '结果已固化'
  );
}

/** 读取安全记录中的字符串字段。 */
function readString(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

/** 读取安全记录中的数值字段。 */
function readNumber(record: Record<string, unknown> | null | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

/** 读取安全记录中的嵌套对象字段。 */
function readRecord(
  record: Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** 从旧事件的“动作：实体标题”文本中恢复缺失的实体名称。 */
function readCreatedEntityTitle(eventTitle: string, action: string): string | undefined {
  const prefix = `${action}：`;
  return eventTitle.startsWith(prefix) ? eventTitle.slice(prefix.length).trim() || undefined : undefined;
}

/** 为事件生成与回放轨道一致的稳定节点标识。 */
function createReplayEventId(eventId: number): string {
  return `event-${eventId}`;
}

/** 格式化实体节点时间。 */
function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
