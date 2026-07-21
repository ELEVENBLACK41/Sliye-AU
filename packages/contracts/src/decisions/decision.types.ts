/**
 * 本文件定义最小决策列表、详情和创建流程使用的跨端数据契约。
 */

/** 决策事项从草稿、讨论、形成正式决议到归档的全局业务状态；投票状态由具体轮次管理。 */
export type DecisionStatus = 'DRAFT' | 'DISCUSSING' | 'RESOLVED' | 'ARCHIVED';

/** 用户参与某个决策时承担的角色。 */
export type DecisionParticipantRole = 'VIEWER' | 'EDITOR' | 'APPROVER' | 'OWNER';

/** 提案从开放到被接受、拒绝或取消的业务状态。 */
export type DecisionProposalStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/** 通过参与者新增接口可以分配的身份，负责人身份由决策负责人字段单独维护。 */
export type AddableDecisionParticipantRole = Exclude<DecisionParticipantRole, 'OWNER'>;

/** 决策时间线中允许出现的稳定事件类型。 */
export type DecisionEventType =
  | 'DECISION_CREATED'
  | 'DECISION_UPDATED'
  | 'STATUS_CHANGED'
  | 'PARTICIPANT_ADDED'
  | 'PARTICIPANT_REMOVED'
  | 'PROPOSAL_CREATED'
  | 'PROPOSAL_UPDATED'
  | 'VOTE_ROUND_CREATED'
  | 'VOTE_ROUND_OPENED'
  | 'VOTE_ROUND_CLOSED'
  | 'VOTE_CAST'
  | 'RESOLUTION_CREATED'
  | 'RESOLUTION_SUPERSEDED'
  | 'RESOLUTION_REVOKED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'SPACE_LINKED'
  | 'MESSAGE_PINNED'
  | 'MEETING_STARTED'
  | 'MEETING_ENDED'
  | 'RECORDING_READY'
  | 'AI_SUMMARY_CREATED';

/** 决策所属部门的轻量摘要。 */
export type DecisionDepartmentSummary = {
  /** 部门数据库主键。 */
  id: number;
  /** 稳定且全局唯一的部门代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
};

/** 决策创建人、负责人或参与人的轻量摘要。 */
export type DecisionUserSummary = {
  /** 用户数据库主键。 */
  id: number;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
};

/** 决策列表中的一条摘要。 */
export type DecisionSummary = {
  /** 决策数据库主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
  /** 决策背景或目标说明。 */
  description: string | null;
  /** 决策当前业务状态。 */
  status: DecisionStatus;
  /** 决策所属部门。 */
  department: DecisionDepartmentSummary;
  /** 创建该决策的用户。 */
  creator: DecisionUserSummary;
  /** 当前决策负责人；尚未指定时为 `null`。 */
  owner: DecisionUserSummary | null;
  /** 当前决策参与者数量。 */
  participantCount: number;
  /** 决策形成最终结论的时间；尚未形成时为 `null`。 */
  decidedAt: string | null;
  /** 决策归档时间；尚未归档时为 `null`。 */
  archivedAt: string | null;
  /** 决策创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 决策最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 决策详情中的一名参与者。 */
export type DecisionParticipant = {
  /** 决策参与关系主键。 */
  id: number;
  /** 参与用户摘要。 */
  user: DecisionUserSummary;
  /** 用户在当前决策中承担的角色。 */
  role: DecisionParticipantRole;
  /** 用户加入决策的时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/** 可以被添加到某个决策事项中的用户候选摘要。 */
export type DecisionParticipantCandidate = {
  /** 候选用户数据库主键，提交新增参与者请求时使用。 */
  id: number;
  /** 候选用户显示名称。 */
  name: string | null;
  /** 候选用户头像地址。 */
  avatarUrl: string | null;
  /** 候选用户所属部门；服务端只返回具备有效部门的可用用户。 */
  department: DecisionDepartmentSummary | null;
};

/** 决策详情中展示的一条提案。 */
export type DecisionProposal = {
  /** 提案数据库主键。 */
  id: number;
  /** 提案所属决策主键。 */
  decisionId: number;
  /** 提案标题。 */
  title: string;
  /** 提案的背景、方案或补充说明。 */
  description: string | null;
  /** 提案当前业务状态。 */
  status: DecisionProposalStatus;
  /** 创建提案的用户。 */
  creator: DecisionUserSummary;
  /** 提案被接受的时间；尚未接受时为 `null`。 */
  acceptedAt: string | null;
  /** 提案结束开放状态的时间；仍开放时为 `null`。 */
  closedAt: string | null;
  /** 提案创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 提案最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 决策事件时间线中的一条记录。 */
export type DecisionEventTimelineItem = {
  /** 决策事件数据库主键。 */
  id: number;
  /** 事件的稳定业务类型。 */
  type: DecisionEventType;
  /** 面向用户展示的事件标题。 */
  title: string;
  /** 触发事件的用户；系统事件或原用户已删除时为 `null`。 */
  actor: DecisionUserSummary | null;
  /** 关联会议主键；事件不属于会议时为 `null`。 */
  meetingId: number | null;
  /** 关联提案主键；事件不属于提案时为 `null`。 */
  proposalId: number | null;
  /** 关联任务主键；事件不属于任务时为 `null`。 */
  taskId: number | null;
  /** 事件携带的业务上下文；没有附加信息时为 `null`。 */
  payload: Record<string, unknown> | null;
  /** 业务变更前的安全快照；不涉及字段变更时为 `null`。 */
  before: Record<string, unknown> | null;
  /** 业务变更后的安全快照；不涉及字段变更时为 `null`。 */
  after: Record<string, unknown> | null;
  /** 事件在业务流程中发生的时间，使用 ISO 8601 字符串。 */
  occurredAt: string;
  /** 事件相对会议录像开始时间的毫秒偏移；未绑定录像时为 `null`。 */
  recordingOffsetMs: number | null;
  /** 事件记录写入数据库的时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/** 决策详情，包含摘要信息和完整参与者列表。 */
export type DecisionDetail = DecisionSummary & {
  /** 当前决策的全部参与者。 */
  participants: DecisionParticipant[];
};

/** 创建决策的请求体。 */
export type CreateDecisionRequestPayload = {
  /** 决策标题。 */
  title: string;
  /** 决策背景或目标说明。 */
  description?: string;
  /** 决策所属的启用部门主键。 */
  departmentId: number;
  /** 初始负责人用户主键；省略或传入 `null` 时由服务端使用创建人。 */
  ownerId?: number | null;
};

/** 将草稿决策推进到讨论阶段的请求体。 */
export type UpdateDecisionStatusRequestPayload = {
  /** 本阶段唯一允许进入的目标状态。 */
  status: Extract<DecisionStatus, 'DISCUSSING'>;
};

/** 向现有决策添加一名参与者的请求体。 */
export type AddDecisionParticipantRequestPayload = {
  /** 需要加入决策的可用用户主键。 */
  userId: number;
  /** 新参与者在当前决策中承担的非负责人身份。 */
  role: AddableDecisionParticipantRole;
};

/** 在现有决策中创建开放提案的请求体。 */
export type CreateDecisionProposalRequestPayload = {
  /** 提案标题。 */
  title: string;
  /** 提案的背景、方案或补充说明。 */
  description?: string;
};

/** 决策列表接口返回的业务数据。 */
export type DecisionListResponse = DecisionSummary[];

/** 决策事件时间线接口返回的业务数据。 */
export type DecisionEventTimelineResponse = DecisionEventTimelineItem[];

/** 可添加决策参与者候选接口返回的业务数据。 */
export type DecisionParticipantCandidateListResponse = DecisionParticipantCandidate[];

/** 决策提案列表接口返回的业务数据。 */
export type DecisionProposalListResponse = DecisionProposal[];

/** 决策列表接口支持的筛选条件。 */
export type DecisionListQuery = {
  /** 按标题或说明执行模糊搜索的关键词。 */
  keyword?: string;
  /** 按决策状态筛选。 */
  status?: DecisionStatus;
  /** 按部门主键筛选，仍会叠加当前用户的数据范围。 */
  departmentId?: number;
};
