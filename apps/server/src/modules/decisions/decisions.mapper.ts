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
  Decision,
  DecisionBallot,
  DecisionEvent,
  DecisionParticipant,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteOption,
  DecisionVoteRound,
  Department,
  User,
} from '../../generated/prisma';

/** 决策列表映射需要的关联数据。 */
type DecisionSummaryRecord = Decision & {
  /** 决策所属部门。 */
  department: Department;
  /** 决策创建人。 */
  creator: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  /** 决策负责人。 */
  owner: Pick<User, 'id' | 'name' | 'avatarUrl'> | null;
  /** 聚合统计。 */
  _count: { participants: number };
};

/** 决策详情映射需要的参与者关联数据。 */
type DecisionDetailRecord = DecisionSummaryRecord & {
  /** 决策参与人及其身份。 */
  participants: Array<
    DecisionParticipant & {
      /** 参与用户摘要。 */
      user: Pick<User, 'id' | 'name' | 'avatarUrl'>;
    }
  >;
};

/** 单个决策参与者映射需要的用户关联数据。 */
export type DecisionParticipantRecord = DecisionParticipant & {
  /** 参与用户摘要。 */
  user: Pick<User, 'id' | 'name' | 'avatarUrl'>;
};

/** 候选参与者映射需要的用户和部门摘要。 */
export type DecisionParticipantCandidateRecord = Pick<
  User,
  'id' | 'name' | 'avatarUrl'
> & {
  /** 候选用户所属部门；不可用用户已在查询阶段被过滤。 */
  department: Pick<Department, 'id' | 'code' | 'name'> | null;
};

/** 单个提案映射需要的创建人摘要。 */
export type DecisionProposalRecord = DecisionProposal & {
  /** 创建提案的用户摘要。 */
  creator: Pick<User, 'id' | 'name' | 'avatarUrl'>;
};

/** 决策时间线映射需要的事件与操作者关联数据。 */
export type DecisionEventRecord = DecisionEvent & {
  /** 触发事件的用户；系统事件或用户已删除时为空。 */
  actor: Pick<User, 'id' | 'name' | 'avatarUrl'> | null;
};

/** 投票轮次映射需要的选项统计和当前用户选票数据。 */
export type DecisionVoteRoundRecord = DecisionVoteRound & {
  /** 创建投票的用户摘要。 */
  creator: Pick<User, 'id' | 'name' | 'avatarUrl'>;
  /** 投票选项及各自选择数。 */
  options: Array<DecisionVoteOption & { _count: { choices: number } }>;
  /** 当前用户在本轮已经提交的选票，查询最多返回一条。 */
  ballots: Array<Pick<DecisionBallot, 'id'>>;
  /** 本轮全部选票聚合数。 */
  _count: { ballots: number };
};

/** 正式决议映射需要的确认人摘要。 */
export type DecisionResolutionRecord = DecisionResolution & {
  /** 正式确认决议的用户摘要。 */
  decidedBy: Pick<User, 'id' | 'name' | 'avatarUrl'>;
};

/** 将数据库决策映射为列表摘要。 */
export function toDecisionSummary(
  decision: DecisionSummaryRecord,
): DecisionSummary {
  return {
    id: decision.id,
    title: decision.title,
    description: decision.description,
    status: decision.status,
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
function getVoteCount(round: DecisionVoteRoundRecord, code: string): number {
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
function toDecisionUser(user: Pick<User, 'id' | 'name' | 'avatarUrl'>) {
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
