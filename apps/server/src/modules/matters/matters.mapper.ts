/**
 * 本文件负责把议事、分区、成员和消息的 Prisma 查询结果转换为共享契约。
 */
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  MatterChatMessage,
  MatterDetail,
  MatterMember,
  MatterSummary,
  MatterUserSummary,
} from '@workspace/contracts/matters';
import type {
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  DiscussionMessageType,
  MatterMemberRole,
  MatterStatus,
} from '../../generated/prisma';

/** Mapper 使用的用户最小数据结构。 */
export type MatterUserRecord = {
  /** 用户主键。 */
  id: number;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
};

/** Mapper 使用的议事摘要记录。 */
export type MatterSummaryRecord = {
  id: number;
  title: string;
  description: string | null;
  status: MatterStatus;
  department: { id: number; code: string; name: string };
  createdBy: MatterUserRecord;
  owner: MatterUserRecord | null;
  _count: { members: number; areas: number; decisions: number };
  areas: Array<{ _count: { meetings: number } }>;
  closedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Mapper 使用的议事详情记录。 */
export type MatterDetailRecord = MatterSummaryRecord & {
  members: Array<{ role: MatterMemberRole }>;
  publicAreas: Array<{ id: number }>;
};

/** Mapper 使用的议事成员记录。 */
export type MatterMemberRecord = {
  id: number;
  role: MatterMemberRole;
  user: MatterUserRecord;
  createdAt: Date;
};

/** Mapper 使用的讨论分区摘要记录。 */
export type DiscussionAreaSummaryRecord = {
  id: number;
  matterId: number;
  name: string;
  description: string | null;
  type: DiscussionAreaType;
  status: DiscussionAreaStatus;
  createdBy: MatterUserRecord;
  members: Array<{ role: DiscussionAreaMemberRole }>;
  _count: { members: number };
  matter: { _count: { members: number } };
  createdAt: Date;
  updatedAt: Date;
};

/** Mapper 使用的私有分区成员记录。 */
export type DiscussionAreaMemberRecord = {
  id: number;
  role: DiscussionAreaMemberRole;
  user: MatterUserRecord;
  createdAt: Date;
};

/** Mapper 使用的分区消息记录。 */
export type MatterChatMessageRecord = {
  id: number;
  areaId: number;
  area: { matterId: number };
  clientMessageId: string | null;
  type: DiscussionMessageType;
  content: string;
  author: MatterUserRecord | null;
  replyToId: number | null;
  replyTo: {
    id: number;
    author: MatterUserRecord | null;
    content: string;
    deletedAt: Date | null;
  } | null;
  meetingId: number | null;
  decision: { id: number; title: string } | null;
  publishedAs: {
    id: number;
    title: string;
    sourceArea: { name: string };
  } | null;
  pinnedAt: Date | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

/** 将数据库用户映射为议事共享摘要。 */
export function toMatterUser(user: MatterUserRecord): MatterUserSummary {
  return { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
}

/** 将数据库议事映射为列表摘要。 */
export function toMatterSummary(matter: MatterSummaryRecord): MatterSummary {
  return {
    id: matter.id,
    title: matter.title,
    description: matter.description,
    status: matter.status,
    department: matter.department,
    createdBy: toMatterUser(matter.createdBy),
    owner: matter.owner ? toMatterUser(matter.owner) : null,
    memberCount: matter._count.members,
    areaCount: matter._count.areas,
    decisionCount: matter._count.decisions,
    meetingCount: matter.areas.reduce(
      (total, area) => total + area._count.meetings,
      0,
    ),
    closedAt: matter.closedAt?.toISOString() ?? null,
    archivedAt: matter.archivedAt?.toISOString() ?? null,
    createdAt: matter.createdAt.toISOString(),
    updatedAt: matter.updatedAt.toISOString(),
  };
}

/** 将数据库议事映射为带当前用户角色和公共区的详情。 */
export function toMatterDetail(matter: MatterDetailRecord): MatterDetail {
  const role = matter.members[0]?.role;
  const publicAreaId = matter.publicAreas[0]?.id;

  if (!role || !publicAreaId) {
    throw new Error('议事详情缺少当前成员关系或公共分区');
  }

  return {
    ...toMatterSummary(matter),
    currentUserRole: role,
    publicAreaId,
  };
}

/** 将数据库议事成员映射为共享契约。 */
export function toMatterMember(member: MatterMemberRecord): MatterMember {
  return {
    id: member.id,
    user: toMatterUser(member.user),
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}

/** 将数据库讨论分区映射为当前用户可见的摘要。 */
export function toDiscussionAreaSummary(
  area: DiscussionAreaSummaryRecord,
): DiscussionAreaSummary {
  return {
    id: area.id,
    matterId: area.matterId,
    name: area.name,
    description: area.description,
    type: area.type,
    status: area.status,
    createdBy: toMatterUser(area.createdBy),
    memberCount:
      area.type === 'PUBLIC' ? area.matter._count.members : area._count.members,
    currentUserRole:
      area.type === 'PUBLIC' ? null : (area.members[0]?.role ?? null),
    createdAt: area.createdAt.toISOString(),
    updatedAt: area.updatedAt.toISOString(),
  };
}

/** 将数据库私有分区成员映射为共享契约。 */
export function toDiscussionAreaMember(
  member: DiscussionAreaMemberRecord,
): DiscussionAreaMember {
  return {
    id: member.id,
    user: toMatterUser(member.user),
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}

/** 将数据库分区消息映射为安全共享契约。 */
export function toMatterChatMessage(
  message: MatterChatMessageRecord,
): MatterChatMessage {
  return {
    id: message.id,
    matterId: message.area.matterId,
    areaId: message.areaId,
    clientMessageId: message.clientMessageId,
    type: message.type,
    content: message.deletedAt ? null : message.content,
    author: message.author ? toMatterUser(message.author) : null,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          author: message.replyTo.author
            ? toMatterUser(message.replyTo.author)
            : null,
          content: message.replyTo.deletedAt ? null : message.replyTo.content,
          deletedAt: message.replyTo.deletedAt?.toISOString() ?? null,
        }
      : null,
    meetingId: message.meetingId,
    decision: message.decision,
    publication: message.publishedAs
      ? {
          id: message.publishedAs.id,
          title: message.publishedAs.title,
          sourceAreaName: message.publishedAs.sourceArea.name,
        }
      : null,
    pinnedAt: message.pinnedAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}
