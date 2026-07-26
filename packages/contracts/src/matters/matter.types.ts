/**
 * 本文件定义议事、讨论分区、分区消息、公开摘要和审计读取的跨端共享契约。
 */

/** 议事从协作中到关闭、归档的生命周期状态。 */
export type MatterStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';

/** 用户在一项议事中承担的成员角色。 */
export type MatterMemberRole = 'OWNER' | 'MANAGER' | 'MEMBER' | 'VIEWER';

/** 讨论分区的可见边界类型。 */
export type DiscussionAreaType = 'PUBLIC' | 'PRIVATE';

/** 用户在私有讨论分区中承担的角色。 */
export type DiscussionAreaMemberRole = 'MANAGER' | 'MEMBER';

/** 讨论分区的独立生命周期状态。 */
export type DiscussionAreaStatus = 'ACTIVE' | 'READ_ONLY' | 'ARCHIVED';

/** 分区消息的稳定内容类型。 */
export type MatterChatMessageType = 'TEXT' | 'SYSTEM' | 'PUBLICATION';

/** 分区消息游标查询的移动方向。 */
export type MatterChatPageDirection = 'before' | 'after';

/** 议事、分区和消息中复用的用户摘要。 */
export type MatterUserSummary = {
  /** 用户数据库主键。 */
  id: number;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
};

/** 议事发起部门的轻量摘要。 */
export type MatterDepartmentSummary = {
  /** 部门数据库主键。 */
  id: number;
  /** 稳定且全局唯一的部门代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
};

/** 议事列表中的一条摘要。 */
export type MatterSummary = {
  /** 议事数据库主键。 */
  id: number;
  /** 议事标题。 */
  title: string;
  /** 议事背景或目标说明。 */
  description: string | null;
  /** 议事当前生命周期状态。 */
  status: MatterStatus;
  /** 议事发起部门。 */
  department: MatterDepartmentSummary;
  /** 创建议事的用户。 */
  createdBy: MatterUserSummary;
  /** 当前议事负责人；负责人账号失效时为 `null`。 */
  owner: MatterUserSummary | null;
  /** 当前议事成员数量。 */
  memberCount: number;
  /** 当前议事讨论分区数量。 */
  areaCount: number;
  /** 当前议事正式决策数量。 */
  decisionCount: number;
  /** 当前议事会议数量。 */
  meetingCount: number;
  /** 议事关闭时间。 */
  closedAt: string | null;
  /** 议事归档时间。 */
  archivedAt: string | null;
  /** 议事创建时间。 */
  createdAt: string;
  /** 议事最后更新时间。 */
  updatedAt: string;
};

/** 议事详情及当前用户在议事中的上下文。 */
export type MatterDetail = MatterSummary & {
  /** 当前用户在议事中的成员角色。 */
  currentUserRole: MatterMemberRole;
  /** 系统为议事创建的唯一公共分区主键。 */
  publicAreaId: number;
};

/** 议事成员列表中的一名成员。 */
export type MatterMember = {
  /** 议事成员关系主键。 */
  id: number;
  /** 成员用户摘要。 */
  user: MatterUserSummary;
  /** 用户在议事中的角色。 */
  role: MatterMemberRole;
  /** 成员加入议事的时间。 */
  createdAt: string;
};

/** 当前用户可见的一个讨论分区摘要。 */
export type DiscussionAreaSummary = {
  /** 分区数据库主键。 */
  id: number;
  /** 分区所属议事主键。 */
  matterId: number;
  /** 分区名称。 */
  name: string;
  /** 分区用途说明。 */
  description: string | null;
  /** 分区是公共区还是私有区。 */
  type: DiscussionAreaType;
  /** 分区当前生命周期状态。 */
  status: DiscussionAreaStatus;
  /** 创建分区的用户。 */
  createdBy: MatterUserSummary;
  /** 当前私有分区成员数量；公共区返回议事成员数量。 */
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
  user: MatterUserSummary;
  /** 用户在私有分区中的角色。 */
  role: DiscussionAreaMemberRole;
  /** 成员加入分区的时间。 */
  createdAt: string;
};

/** 消息中可选关联的决策摘要。 */
export type MatterMessageDecisionSummary = {
  /** 决策数据库主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
};

/** 消息回复区域展示的原消息轻量摘要。 */
export type MatterChatReplyPreview = {
  /** 被回复消息数据库主键。 */
  id: number;
  /** 被回复消息发送人。 */
  author: MatterUserSummary | null;
  /** 被回复消息正文；消息已删除时为 `null`。 */
  content: string | null;
  /** 被回复消息删除时间。 */
  deletedAt: string | null;
};

/** 公开摘要消息携带的安全发布信息。 */
export type DiscussionPublicationSummary = {
  /** 摘要发布记录主键。 */
  id: number;
  /** 公开标题。 */
  title: string;
  /** 来源私有分区名称，仅用于解释来源，不提供原文访问入口。 */
  sourceAreaName: string;
};

/** 分区聊天对外返回的一条持久化消息。 */
export type MatterChatMessage = {
  /** 消息数据库主键，也是稳定分页游标。 */
  id: number;
  /** 消息所属议事主键。 */
  matterId: number;
  /** 消息所属分区主键。 */
  areaId: number;
  /** 浏览器生成的幂等标识；系统消息为 `null`。 */
  clientMessageId: string | null;
  /** 消息内容类型。 */
  type: MatterChatMessageType;
  /** 消息正文；消息已删除时为 `null`。 */
  content: string | null;
  /** 消息发送人。 */
  author: MatterUserSummary | null;
  /** 可选的一级回复目标摘要。 */
  replyTo: MatterChatReplyPreview | null;
  /** 可选的来源会议主键。 */
  meetingId: number | null;
  /** 可选的单项关联决策。 */
  decision: MatterMessageDecisionSummary | null;
  /** 公开摘要的安全发布信息；普通消息为 `null`。 */
  publication: DiscussionPublicationSummary | null;
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
export type MatterChatMessagePage = {
  /** 按消息主键升序排列的当前页消息。 */
  items: MatterChatMessage[];
  /** 继续按当前方向查询的游标。 */
  nextCursor: number | null;
  /** 当前方向是否仍有更多消息。 */
  hasMore: boolean;
};

/** 创建议事的请求体。 */
export type CreateMatterRequestPayload = {
  /** 议事标题。 */
  title: string;
  /** 议事背景或目标说明。 */
  description?: string;
  /** 发起部门主键。 */
  departmentId: number;
};

/** 更新议事生命周期的请求体。 */
export type UpdateMatterStatusRequestPayload = {
  /** 允许进入的目标状态。 */
  status: MatterStatus;
};

/** 向议事添加成员的请求体。 */
export type AddMatterMemberRequestPayload = {
  /** 需要加入议事的用户主键。 */
  userId: number;
  /** 新成员在议事中的角色。 */
  role: Exclude<MatterMemberRole, 'OWNER'>;
};

/** 更新议事成员角色的请求体。 */
export type UpdateMatterMemberRequestPayload = {
  /** 更新后的非负责人角色。 */
  role: Exclude<MatterMemberRole, 'OWNER'>;
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
  /** 需要加入私有分区的议事成员主键。 */
  userId: number;
  /** 新成员在私有分区中的角色。 */
  role: DiscussionAreaMemberRole;
};

/** 分区消息列表接口的游标查询参数。 */
export type MatterChatMessageListQuery = {
  /** 相对游标向前加载历史或向后补齐新消息。 */
  direction?: MatterChatPageDirection;
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
export type CreateMatterChatMessageRequestPayload = {
  /** 浏览器生成的 UUID，用于网络重试时保持幂等。 */
  clientMessageId: string;
  /** 去除首尾空白后长度为 1 至 2000 的正文。 */
  content: string;
  /** 可选的同分区一级回复目标。 */
  replyToId?: number;
  /** 可选的来源会议主键。 */
  meetingId?: number;
  /** 可选的同议事关联决策主键。 */
  decisionId?: number;
};

/** 从私有区发布公开摘要的请求体。 */
export type CreateDiscussionPublicationRequestPayload = {
  /** 公开摘要标题。 */
  title: string;
  /** 将作为公共区快照保存的摘要正文。 */
  summary: string;
  /** 被摘要引用的私有原始消息主键。 */
  sourceMessageIds: number[];
  /** 可选的同议事关联决策主键。 */
  decisionId?: number;
};

/** 浏览器连接指定议事分区实时房间所需的短期凭证。 */
export type MatterChatTicket = {
  /** 只允许连接当前议事分区的签名短期凭证。 */
  ticket: string;
  /** 凭证过期时间。 */
  expiresAt: string;
  /** Socket.IO 固定命名空间。 */
  namespace: '/matter-chat';
};

/** 分区聊天服务端向浏览器推送的实时事件映射。 */
export type MatterChatRealtimeEvents = {
  /** 消息完成数据库提交后的创建事件。 */
  'matter-chat.message.created': MatterChatMessage;
  /** 当前用户的分区访问权被移除。 */
  'matter-chat.access.revoked': { matterId: number; areaId: number };
};

/** 管理员审计读取私有内容的请求体。 */
export type MatterAuditReadRequestPayload = {
  /** 目标议事主键。 */
  matterId: number;
  /** 目标私有分区主键。 */
  areaId: number;
  /** 可选的目标会议主键；传入后只返回该会议消息。 */
  meetingId?: number;
  /** 本次访问的具体审计原因。 */
  reason: string;
};

/** 一次私有内容审计读取的只读结果。 */
export type MatterAuditReadResponse = {
  /** 本次访问产生的审计日志主键。 */
  auditLogId: number;
  /** 目标议事摘要。 */
  matter: { id: number; title: string };
  /** 目标私有分区摘要。 */
  area: { id: number; name: string };
  /** 可选的目标会议摘要。 */
  meeting: { id: number; title: string } | null;
  /** 只读返回的最近私有消息，最多 100 条。 */
  messages: MatterChatMessage[];
  /** 审计读取发生时间。 */
  accessedAt: string;
};

/** 议事列表接口返回数据。 */
export type MatterListResponse = MatterSummary[];

/** 议事成员列表接口返回数据。 */
export type MatterMemberListResponse = MatterMember[];

/** 当前用户可见分区列表接口返回数据。 */
export type DiscussionAreaListResponse = DiscussionAreaSummary[];

/** 私有分区成员列表接口返回数据。 */
export type DiscussionAreaMemberListResponse = DiscussionAreaMember[];
