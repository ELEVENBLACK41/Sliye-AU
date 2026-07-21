/*
 * @Description: 决策数据库实体到前后端共享响应契约的映射函数。
 */
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
  DecisionSummary,
} from '@workspace/contracts/decisions';
import type {
  Decision,
  DecisionEvent,
  DecisionParticipant,
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

/** 决策时间线映射需要的事件与操作者关联数据。 */
export type DecisionEventRecord = DecisionEvent & {
  /** 触发事件的用户；系统事件或用户已删除时为空。 */
  actor: Pick<User, 'id' | 'name' | 'avatarUrl'> | null;
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
    participants: decision.participants.map((participant) => ({
      id: participant.id,
      role: participant.role,
      user: toDecisionUser(participant.user),
      createdAt: participant.createdAt.toISOString(),
    })),
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
    taskId: event.taskId,
    payload: toRecord(event.payload),
    before: toRecord(event.before),
    after: toRecord(event.after),
    occurredAt: event.occurredAt.toISOString(),
    recordingOffsetMs: event.recordingOffsetMs,
    createdAt: event.createdAt.toISOString(),
  };
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
