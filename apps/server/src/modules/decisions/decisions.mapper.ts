/*
 * @Description: 决策数据库实体到前后端共享响应契约的映射函数。
 */
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
  DecisionParticipant as DecisionParticipantContract,
  DecisionParticipantCandidate,
  DecisionProposal as DecisionProposalContract,
  DecisionResolution as DecisionResolutionContract,
  DecisionSummary,
  DecisionVoteOutcome,
  DecisionVoteRound as DecisionVoteRoundContract,
} from '@workspace/contracts/decisions';
import type {
  DecisionDetailRecord,
  DecisionEventRecord,
  DecisionParticipantCandidateRecord,
  DecisionParticipantRecord,
  DecisionProposalRecord,
  DecisionResolutionRecord,
  DecisionSummaryRecord,
  DecisionUserRecord,
  DecisionVoteRoundRecord,
} from './types/decision-mapper.types';

/** 标准决策投票选项使用的稳定代码。 */
type StandardDecisionVoteOptionCode = 'APPROVE' | 'REJECT' | 'ABSTAIN';

/** 将数据库决策映射为列表摘要。 */
export function toDecisionSummary(
  decision: DecisionSummaryRecord,
): DecisionSummary {
  return {
    id: decision.id,
    title: decision.title,
    description: decision.description,
    status: decision.status,
    projectId: decision.projectId,
    scope: (decision.areaId ?? null) === null ? 'PROJECT' : 'AREA',
    area: decision.area ?? null,
    project: decision.project,
    department: {
      id: decision.department.id,
      code: decision.department.code,
      name: decision.department.name,
    },
    creator: toDecisionUser(decision.creator),
    owner: decision.owner ? toDecisionUser(decision.owner) : null,
    participantCount: decision._count.participants,
    decidedAt: decision.decidedAt?.toISOString() ?? null,
    archivedAt: decision.archivedAt?.toISOString() ?? null,
    createdAt: decision.createdAt.toISOString(),
    updatedAt: decision.updatedAt.toISOString(),
  };
}

/** 将数据库决策映射为详情响应。 */
export function toDecisionDetail(
  decision: DecisionDetailRecord,
): DecisionDetail {
  return {
    ...toDecisionSummary(decision),
    participants: decision.participants.map(toDecisionParticipant),
  };
}

/** 将数据库参与关系映射为共享的决策参与者契约。 */
export function toDecisionParticipant(
  participant: DecisionParticipantRecord,
): DecisionParticipantContract {
  return {
    id: participant.id,
    role: participant.role,
    user: toDecisionUser(participant.user),
    createdAt: participant.createdAt.toISOString(),
  };
}

/** 将可用用户映射为不包含邮箱等账号信息的参与者候选摘要。 */
export function toDecisionParticipantCandidate(
  user: DecisionParticipantCandidateRecord,
): DecisionParticipantCandidate {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    department: user.department
      ? {
          id: user.department.id,
          code: user.department.code,
          name: user.department.name,
        }
      : null,
  };
}

/** 将数据库提案映射为共享的决策提案契约。 */
export function toDecisionProposal(
  proposal: DecisionProposalRecord,
): DecisionProposalContract {
  return {
    id: proposal.id,
    decisionId: proposal.decisionId,
    meetingId: proposal.meetingId,
    title: proposal.title,
    description: proposal.description,
    status: proposal.status,
    creator: toDecisionUser(proposal.creator),
    acceptedAt: proposal.acceptedAt?.toISOString() ?? null,
    closedAt: proposal.closedAt?.toISOString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

/** 将数据库投票轮次映射为不泄露匿名投票人的共享契约。 */
export function toDecisionVoteRound(
  round: DecisionVoteRoundRecord,
): DecisionVoteRoundContract {
  const isClosed = round.status === 'CLOSED';
  const approveCount = getVoteCount(round, 'APPROVE');
  const rejectCount = getVoteCount(round, 'REJECT');
  const quorumMet =
    round.quorumCount === null || round._count.ballots >= round.quorumCount;

  return {
    id: round.id,
    decisionId: round.decisionId,
    meetingId: round.meetingId,
    proposalId:
      round.options.find((option) => option.code === 'APPROVE')?.proposalId ??
      null,
    title: round.title,
    description: round.description,
    method: round.method,
    status: round.status,
    isAnonymous: round.isAnonymous,
    quorumCount: round.quorumCount,
    maxChoices: round.maxChoices,
    creator: toDecisionUser(round.creator),
    options: round.options.map((option) => ({
      id: option.id,
      code: option.code,
      label: option.label,
      description: option.description,
      proposalId: option.proposalId,
      sortOrder: option.sortOrder,
      voteCount: isClosed ? option._count.choices : null,
    })),
    hasVoted: round.ballots.length > 0,
    result: isClosed
      ? {
          totalBallots: round._count.ballots,
          quorumCount: round.quorumCount,
          quorumMet,
          outcome: getVoteOutcome(quorumMet, approveCount, rejectCount),
        }
      : null,
    openedAt: round.openedAt?.toISOString() ?? null,
    closedAt: round.closedAt?.toISOString() ?? null,
    createdAt: round.createdAt.toISOString(),
    updatedAt: round.updatedAt.toISOString(),
  };
}

/** 将数据库正式决议映射为共享响应契约。 */
export function toDecisionResolution(
  resolution: DecisionResolutionRecord,
): DecisionResolutionContract {
  return {
    id: resolution.id,
    decisionId: resolution.decisionId,
    meetingId: resolution.meetingId,
    sourceProposalId: resolution.sourceProposalId,
    sourceVoteRoundId: resolution.sourceVoteRoundId,
    title: resolution.title,
    content: resolution.content,
    kind: resolution.kind,
    status: resolution.status,
    decidedBy: toDecisionUser(resolution.decidedBy),
    decidedAt: resolution.decidedAt.toISOString(),
    createdAt: resolution.createdAt.toISOString(),
    updatedAt: resolution.updatedAt.toISOString(),
  };
}

/** 将数据库决策事件映射为跨端时间线契约。 */
export function toDecisionEvent(
  event: DecisionEventRecord,
): DecisionEventTimelineItem {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    actor: event.actor ? toDecisionUser(event.actor) : null,
    meetingId: event.meetingId,
    proposalId: event.proposalId,
    voteRoundId: event.voteRoundId,
    resolutionId: event.resolutionId,
    taskId: event.taskId,
    payload: toRecord(event.payload),
    before: toRecord(event.before),
    after: toRecord(event.after),
    occurredAt: event.occurredAt.toISOString(),
    recordingOffsetMs: event.recordingOffsetMs,
    createdAt: event.createdAt.toISOString(),
  };
}

/** 读取指定稳定代码选项的得票数，不存在时按零票处理。 */
function getVoteCount(
  round: DecisionVoteRoundRecord,
  code: StandardDecisionVoteOptionCode,
): number {
  return (
    round.options.find((option) => option.code === code)?._count.choices ?? 0
  );
}

/** 根据法定人数与赞成、反对票生成统计结论。 */
function getVoteOutcome(
  quorumMet: boolean,
  approveCount: number,
  rejectCount: number,
): DecisionVoteOutcome {
  if (!quorumMet) {
    return 'QUORUM_NOT_MET';
  }

  if (approveCount > rejectCount) {
    return 'APPROVED';
  }

  if (rejectCount > approveCount) {
    return 'REJECTED';
  }

  return 'TIED';
}

/** 映射决策创建人、负责人或参与人的公共摘要。 */
function toDecisionUser(user: DecisionUserRecord) {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

/** 将 Prisma JSON 值安全收窄为时间线契约允许的对象。 */
function toRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
