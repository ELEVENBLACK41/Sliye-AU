/**
 * 本文件定义项目、讨论分区、分区消息和审计读取的跨端共享契约。
 */

/** 项目从协作中到关闭、归档的生命周期状态。 */
export type ProjectStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

/** 用户在一项项目中承担的成员角色。 */
export type ProjectMemberRole = 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';

/** 讨论分区的可见边界类型。 */
export type DiscussionAreaType = 'PUBLIC' | 'PRIVATE';

/** 用户在私有讨论分区中承担的角色。 */
export type DiscussionAreaMemberRole = 'MANAGER' | 'MEMBER';

/** 讨论分区的独立生命周期状态。 */
export type DiscussionAreaStatus = 'ACTIVE' | 'READ_ONLY' | 'ARCHIVED';

/** 分区消息的稳定内容类型。 */
export type ProjectChatMessageType = 'TEXT' | 'SYSTEM';

/** 分区消息游标查询的移动方向。 */
export type ProjectChatPageDirection = 'before' | 'after';

/** 项目、分区和消息中复用的用户摘要。 */
export type ProjectUserSummary = {
  /** 用户数据库主键。 */
  id: number;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
};

/** 项目发起部门的轻量摘要。 */
export type ProjectDepartmentSummary = {
  /** 部门数据库主键。 */
  id: number;
  /** 稳定且全局唯一的部门代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
};

/** 项目列表中的一条摘要。 */
export type ProjectSummary = {
  /** 项目数据库主键。 */
  id: number;
  /** 项目标题。 */
  title: string;
  /** 项目背景或目标说明。 */
  description: string | null;
  /** 项目当前生命周期状态。 */
  status: ProjectStatus;
  /** 项目发起部门。 */
  department: ProjectDepartmentSummary;
  /** 创建项目的用户。 */
  createdBy: ProjectUserSummary;
  /** 当前项目负责人；负责人账号失效时为 `null`。 */
  owner: ProjectUserSummary | null;
  /** 当前项目成员数量。 */
  memberCount: number;
  /** 当前项目讨论分区数量。 */
  areaCount: number;
  /** 当前项目正式决策数量。 */
  decisionCount: number;
  /** 当前项目会议数量。 */
  meetingCount: number;
  /** 项目关闭时间。 */
  closedAt: string | null;
  /** 项目归档时间。 */
  archivedAt: string | null;
  /** 项目创建时间。 */
  createdAt: string;
  /** 项目最后更新时间。 */
  updatedAt: string;
};

/** 项目详情及当前用户在项目中的上下文。 */
export type ProjectDetail = ProjectSummary & {
  /** 当前用户在项目中的成员角色。 */
  currentUserRole: ProjectMemberRole;
  /** 系统为项目创建的唯一公共分区主键。 */
  publicAreaId: number;
};

/** 项目成员列表中的一名成员。 */
export type ProjectMember = {
  /** 项目成员关系主键。 */
  id: number;
  /** 成员用户摘要。 */
  user: ProjectUserSummary;
  /** 用户在项目中的角色。 */
  role: ProjectMemberRole;
  /** 成员加入项目的时间。 */
  createdAt: string;
};

/** 可以被项目管理员加入当前项目的用户候选摘要。 */
export type ProjectMemberCandidate = {
  /** 候选用户数据库主键，仅在提交成员关系时由客户端使用。 */
  id: number;
  /** 候选用户显示名称。 */
  name: string | null;
  /** 候选用户登录邮箱，用于同名用户辨识。 */
  email: string;
  /** 候选用户头像地址。 */
  avatarUrl: string | null;
  /** 候选用户当前所属部门。 */
  department: ProjectDepartmentSummary;
};

/** 当前用户可见的一个讨论分区摘要。 */
export type DiscussionAreaSummary = {
  /** 分区数据库主键。 */
  id: number;
  /** 分区所属项目主键。 */
  projectId: number;
  /** 分区名称。 */
  name: string;
  /** 分区用途说明。 */
  description: string | null;
  /** 分区是公共区还是私有区。 */
  type: DiscussionAreaType;
  /** 分区当前生命周期状态。 */
  status: DiscussionAreaStatus;
  /** 创建分区的用户。 */
  createdBy: ProjectUserSummary;
  /** 当前私有分区成员数量；公共区返回项目成员数量。 */
  memberCount: number;
  /** 当前用户在私有分区中的角色；公共区返回 `null`。 */
  currentUserRole: DiscussionAreaMemberRole | null;
  /** 分区创建时间。 */
  createdAt: string;
  /** 分区最后更新时间。 */
  updatedAt: string;
};

/** 私有分区成员列表中的一名成员。 */
export type DiscussionAreaMember = {
  /** 分区成员关系主键。 */
  id: number;
  /** 成员用户摘要。 */
  user: ProjectUserSummary;
  /** 用户在私有分区中的角色。 */
  role: DiscussionAreaMemberRole;
  /** 成员加入分区的时间。 */
  createdAt: string;
};

/** 消息中可选关联的决策摘要。 */
export type ProjectMessageDecisionSummary = {
  /** 决策数据库主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
};

/** 消息回复区域展示的原消息轻量摘要。 */
export type ProjectChatReplyPreview = {
  /** 被回复消息数据库主键。 */
  id: number;
  /** 被回复消息发送人。 */
  author: ProjectUserSummary | null;
  /** 被回复消息正文；消息已删除时为 `null`。 */
  content: string | null;
  /** 被回复消息删除时间。 */
  deletedAt: string | null;
};

/** 分区聊天对外返回的一条持久化消息。 */
export type ProjectChatMessage = {
  /** 消息数据库主键，也是稳定分页游标。 */
  id: number;
  /** 消息所属项目主键。 */
  projectId: number;
  /** 消息所属分区主键。 */
  areaId: number;
  /** 浏览器生成的幂等标识；系统消息为 `null`。 */
  clientMessageId: string | null;
  /** 消息内容类型。 */
  type: ProjectChatMessageType;
  /** 消息正文；消息已删除时为 `null`。 */
  content: string | null;
  /** 消息发送人。 */
  author: ProjectUserSummary | null;
  /** 可选的一级回复目标摘要。 */
  replyTo: ProjectChatReplyPreview | null;
  /** 可选的来源会议主键。 */
  meetingId: number | null;
  /** 可选的单项关联决策。 */
  decision: ProjectMessageDecisionSummary | null;
  /** 消息固定时间。 */
  pinnedAt: string | null;
  /** 消息编辑时间。 */
  editedAt: string | null;
  /** 消息删除时间。 */
  deletedAt: string | null;
  /** 消息创建时间。 */
  createdAt: string;
};

/** 分区消息分页结果。 */
export type ProjectChatMessagePage = {
  /** 按消息主键升序排列的当前页消息。 */
  items: ProjectChatMessage[];
  /** 继续按当前方向查询的游标。 */
  nextCursor: number | null;
  /** 当前方向是否仍有更多消息。 */
  hasMore: boolean;
};

/** 创建项目的请求体。 */
export type CreateProjectRequestPayload = {
  /** 项目标题。 */
  title: string;
  /** 项目背景或目标说明。 */
  description?: string;
  /** 发起部门主键。 */
  departmentId: number;
};

/** 更新项目生命周期的请求体。 */
export type UpdateProjectStatusRequestPayload = {
  /** 允许进入的目标状态。 */
  status: ProjectStatus;
};

/** 向项目添加成员的请求体。 */
export type AddProjectMemberRequestPayload = {
  /** 需要加入项目的用户主键。 */
  userId: number;
  /** 新成员在项目中的角色。 */
  role: Exclude<ProjectMemberRole, 'OWNER'>;
};

/** 查询当前项目可加入成员的筛选条件。 */
export type ProjectMemberCandidateListQuery = {
  /** 可选的姓名、邮箱或部门模糊搜索词。 */
  q?: string;
};

/** 更新项目成员角色的请求体。 */
export type UpdateProjectMemberRequestPayload = {
  /** 更新后的非负责人角色。 */
  role: Exclude<ProjectMemberRole, 'OWNER'>;
};

/** 创建私有讨论分区的请求体。 */
export type CreateDiscussionAreaRequestPayload = {
  /** 私有分区名称。 */
  name: string;
  /** 私有分区用途说明。 */
  description?: string;
  /** 初始成员用户主键；创建人会被自动加入并成为分区管理员。 */
  memberIds?: number[];
};

/** 更新讨论分区资料和状态的请求体。 */
export type UpdateDiscussionAreaRequestPayload = {
  /** 修改后的分区名称。 */
  name?: string;
  /** 修改后的分区说明；传入 `null` 表示清空。 */
  description?: string | null;
  /** 修改后的可写状态。 */
  status?: DiscussionAreaStatus;
};

/** 向私有讨论分区添加成员的请求体。 */
export type AddDiscussionAreaMemberRequestPayload = {
  /** 需要加入私有分区的项目成员主键。 */
  userId: number;
  /** 新成员在私有分区中的角色。 */
  role: DiscussionAreaMemberRole;
};

/** 分区消息列表接口的游标查询参数。 */
export type ProjectChatMessageListQuery = {
  /** 相对游标向前加载历史或向后补齐新消息。 */
  direction?: ProjectChatPageDirection;
  /** 消息数据库主键游标。 */
  cursor?: number;
  /** 单页消息数量，服务端默认 30 且最大 50。 */
  limit?: number;
  /** 可选的会议筛选条件。 */
  meetingId?: number;
  /** 可选的决策筛选条件。 */
  decisionId?: number;
};

/** 发送分区文字消息的请求体。 */
export type CreateProjectChatMessageRequestPayload = {
  /** 浏览器生成的 UUID，用于网络重试时保持幂等。 */
  clientMessageId: string;
  /** 去除首尾空白后长度为 1 至 2000 的正文。 */
  content: string;
  /** 可选的同分区一级回复目标。 */
  replyToId?: number;
  /** 可选的来源会议主键。 */
  meetingId?: number;
  /** 可选的项目级决策或当前分区小组决策主键。 */
  decisionId?: number;
};

/** 浏览器连接指定项目分区实时房间所需的短期凭证。 */
export type ProjectChatTicket = {
  /** 只允许连接当前项目分区的签名短期凭证。 */
  ticket: string;
  /** 凭证过期时间。 */
  expiresAt: string;
  /** Socket.IO 固定命名空间。 */
  namespace: '/project-chat';
};

/** 分区聊天服务端向浏览器推送的实时事件映射。 */
export type ProjectChatRealtimeEvents = {
  /** 消息完成数据库提交后的创建事件。 */
  'project-chat.message.created': ProjectChatMessage;
  /** 当前用户的分区访问权被移除。 */
  'project-chat.access.revoked': { projectId: number; areaId: number };
};

/** 管理员审计读取私有内容的请求体。 */
export type ProjectAuditReadRequestPayload = {
  /** 目标项目主键。 */
  projectId: number;
  /** 目标私有分区主键。 */
  areaId: number;
  /** 可选的目标会议主键；传入后只返回该会议消息。 */
  meetingId?: number;
  /** 本次访问的具体审计原因。 */
  reason: string;
};

/** 一次私有内容审计读取的只读结果。 */
export type ProjectAuditReadResponse = {
  /** 本次访问产生的审计日志主键。 */
  auditLogId: number;
  /** 目标项目摘要。 */
  project: { id: number; title: string };
  /** 目标私有分区摘要。 */
  area: { id: number; name: string };
  /** 可选的目标会议摘要。 */
  meeting: { id: number; title: string } | null;
  /** 只读返回的最近私有消息，最多 100 条。 */
  messages: ProjectChatMessage[];
  /** 审计读取发生时间。 */
  accessedAt: string;
};

/** 项目列表接口返回数据。 */
export type ProjectListResponse = ProjectSummary[];

/** 项目成员列表接口返回数据。 */
export type ProjectMemberListResponse = ProjectMember[];

/** 当前项目可加入成员候选列表接口返回数据。 */
export type ProjectMemberCandidateListResponse = ProjectMemberCandidate[];

/** 当前用户可见分区列表接口返回数据。 */
export type DiscussionAreaListResponse = DiscussionAreaSummary[];

/** 私有分区成员列表接口返回数据。 */
export type DiscussionAreaMemberListResponse = DiscussionAreaMember[];
