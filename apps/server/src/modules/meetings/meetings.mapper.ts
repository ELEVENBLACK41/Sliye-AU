/**
 * 本文件负责把 Prisma 会议查询结果转换为前后端共享会议契约。
 */
import type {
  MeetingDetail,
  MeetingParticipant,
  MeetingSummary,
  MeetingUserSummary,
} from '@workspace/contracts/meetings';
import type { Prisma } from '../../generated/prisma';

/** 会议摘要查询统一加载的关系。 */
export const meetingSummaryInclude = {
  createdBy: {
    select: { id: true, name: true, avatarUrl: true },
  },
  space: {
    select: {
      decision: {
        select: { id: true, ownerId: true, status: true },
      },
    },
  },
  _count: {
    select: { participants: true },
  },
} as const satisfies Prisma.MeetingSessionInclude;

/** 会议详情查询统一加载的关系。 */
export const meetingDetailInclude = {
  ...meetingSummaryInclude,
  participants: {
    include: {
      user: {
        select: { id: true, name: true, avatarUrl: true },
      },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  },
} as const satisfies Prisma.MeetingSessionInclude;

/** 会议摘要 Mapper 实际消费的 Prisma 查询结果。 */
export type MeetingSummaryRecord = Prisma.MeetingSessionGetPayload<{
  include: typeof meetingSummaryInclude;
}>;

/** 会议详情 Mapper 实际消费的 Prisma 查询结果。 */
export type MeetingDetailRecord = Prisma.MeetingSessionGetPayload<{
  include: typeof meetingDetailInclude;
}>;

/** 将数据库用户字段映射为会议用户摘要。 */
function toMeetingUser(
  user: MeetingSummaryRecord['createdBy'],
): MeetingUserSummary {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
}

/** 将数据库参与关系映射为会议参与者契约。 */
function toMeetingParticipant(
  participant: MeetingDetailRecord['participants'][number],
): MeetingParticipant {
  return {
    id: participant.id,
    meetingId: participant.meetingId,
    role: participant.role,
    user: toMeetingUser(participant.user),
    joinedAt: participant.joinedAt?.toISOString() ?? null,
    leftAt: participant.leftAt?.toISOString() ?? null,
    createdAt: participant.createdAt.toISOString(),
  };
}

/** 将数据库会议映射为列表和房间头部使用的摘要。 */
export function toMeetingSummary(
  meeting: MeetingSummaryRecord,
): MeetingSummary {
  const decision = meeting.space.decision;

  if (!decision) {
    throw new Error('会议未关联有效决策');
  }

  return {
    id: meeting.id,
    decisionId: decision.id,
    title: meeting.title,
    description: meeting.description,
    status: meeting.status,
    createdBy: toMeetingUser(meeting.createdBy),
    participantCount: meeting._count.participants,
    scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
    startedAt: meeting.startedAt?.toISOString() ?? null,
    endedAt: meeting.endedAt?.toISOString() ?? null,
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
  };
}

/** 将数据库会议映射为包含受邀成员的完整详情。 */
export function toMeetingDetail(meeting: MeetingDetailRecord): MeetingDetail {
  return {
    ...toMeetingSummary(meeting),
    participants: meeting.participants.map(toMeetingParticipant),
  };
}
