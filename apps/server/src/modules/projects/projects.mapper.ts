/**
 * 本文件负责把项目、分区、成员和消息的 Prisma 查询结果转换为共享契约。
 */
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  ProjectChatMessage,
  ProjectDetail,
  ProjectMember,
  ProjectSummary,
  ProjectUserSummary,
} from '@workspace/contracts/projects';
import type {
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  DiscussionMessageType,
  ProjectMemberRole,
  ProjectStatus,
} from '../../generated/prisma';

/** Mapper 使用的用户最小数据结构。 */
export type ProjectUserRecord = {
  /** 用户主键。 */
  id: number;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
};

/** Mapper 使用的项目摘要记录。 */
export type ProjectSummaryRecord = {
  id: number;
  title: string;
  description: string | null;
  status: ProjectStatus;
  department: { id: number; code: string; name: string };
  createdBy: ProjectUserRecord;
  owner: ProjectUserRecord | null;
  _count: { members: number; areas: number; decisions: number };
  areas: Array<{ _count: { meetings: number } }>;
  closedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Mapper 使用的项目详情记录。 */
export type ProjectDetailRecord = ProjectSummaryRecord & {
  members: Array<{ role: ProjectMemberRole }>;
  publicAreas: Array<{ id: number }>;
};

/** Mapper 使用的项目成员记录。 */
export type ProjectMemberRecord = {
  id: number;
  role: ProjectMemberRole;
  user: ProjectUserRecord;
  createdAt: Date;
};

/** Mapper 使用的讨论分区摘要记录。 */
export type DiscussionAreaSummaryRecord = {
  id: number;
  projectId: number;
  name: string;
  description: string | null;
  type: DiscussionAreaType;
  status: DiscussionAreaStatus;
  createdBy: ProjectUserRecord;
  members: Array<{ role: DiscussionAreaMemberRole }>;
  _count: { members: number };
  project: { _count: { members: number } };
  createdAt: Date;
  updatedAt: Date;
};

/** Mapper 使用的私有分区成员记录。 */
export type DiscussionAreaMemberRecord = {
  id: number;
  role: DiscussionAreaMemberRole;
  user: ProjectUserRecord;
  createdAt: Date;
};

/** Mapper 使用的分区消息记录。 */
export type ProjectChatMessageRecord = {
  id: number;
  areaId: number;
  area: { projectId: number };
  clientMessageId: string | null;
  type: DiscussionMessageType;
  content: string;
  author: ProjectUserRecord | null;
  replyToId: number | null;
  replyTo: {
    id: number;
    author: ProjectUserRecord | null;
    content: string;
    deletedAt: Date | null;
  } | null;
  meetingId: number | null;
  decision: { id: number; title: string } | null;
  pinnedAt: Date | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
};

/** 将数据库用户映射为项目共享摘要。 */
export function toProjectUser(user: ProjectUserRecord): ProjectUserSummary {
  return { id: user.id, name: user.name, avatarUrl: user.avatarUrl };
}

/** 将数据库项目映射为列表摘要。 */
export function toProjectSummary(
  project: ProjectSummaryRecord,
): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    department: project.department,
    createdBy: toProjectUser(project.createdBy),
    owner: project.owner ? toProjectUser(project.owner) : null,
    memberCount: project._count.members,
    areaCount: project._count.areas,
    decisionCount: project._count.decisions,
    meetingCount: project.areas.reduce(
      (total, area) => total + area._count.meetings,
      0,
    ),
    closedAt: project.closedAt?.toISOString() ?? null,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** 将数据库项目映射为带当前用户角色和公共区的详情。 */
export function toProjectDetail(project: ProjectDetailRecord): ProjectDetail {
  const role = project.members[0]?.role;
  const publicAreaId = project.publicAreas[0]?.id;

  if (!role || !publicAreaId) {
    throw new Error('项目详情缺少当前成员关系或公共分区');
  }

  return {
    ...toProjectSummary(project),
    currentUserRole: role,
    publicAreaId,
  };
}

/** 将数据库项目成员映射为共享契约。 */
export function toProjectMember(member: ProjectMemberRecord): ProjectMember {
  return {
    id: member.id,
    user: toProjectUser(member.user),
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
    projectId: area.projectId,
    name: area.name,
    description: area.description,
    type: area.type,
    status: area.status,
    createdBy: toProjectUser(area.createdBy),
    memberCount:
      area.type === 'PUBLIC'
        ? area.project._count.members
        : area._count.members,
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
    user: toProjectUser(member.user),
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}

/** 将数据库分区消息映射为安全共享契约。 */
export function toProjectChatMessage(
  message: ProjectChatMessageRecord,
): ProjectChatMessage {
  return {
    id: message.id,
    projectId: message.area.projectId,
    areaId: message.areaId,
    clientMessageId: message.clientMessageId,
    type: message.type,
    content: message.deletedAt ? null : message.content,
    author: message.author ? toProjectUser(message.author) : null,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          author: message.replyTo.author
            ? toProjectUser(message.replyTo.author)
            : null,
          content: message.replyTo.deletedAt ? null : message.replyTo.content,
          deletedAt: message.replyTo.deletedAt?.toISOString() ?? null,
        }
      : null,
    meetingId: message.meetingId,
    decision: message.decision,
    pinnedAt: message.pinnedAt?.toISOString() ?? null,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}
