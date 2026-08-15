/**
 * 本文件定义决策模块 Mapper 实际消费的数据库读取模型，隔离 Prisma 查询结果与跨端响应契约。
 */
import type {
  DecisionVoteMethod,
  DecisionVoteRoundStatus,
} from '@workspace/contracts/decisions';
import type {
  DecisionEventType,
  DecisionStatus,
  ParticipantRole,
  ProposalStatus,
  ResolutionKind,
  ResolutionStatus,
} from '../../../generated/prisma';

/** Mapper 读取的用户最小数据结构。 */
export type DecisionUserRecord = {
  /** 用户主键。 */
  id: number;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
};

/** Mapper 读取的部门最小数据结构。 */
type DecisionDepartmentRecord = {
  /** 部门主键。 */
  id: number;
  /** 部门稳定代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
};

/** 决策列表映射实际读取的查询结果。 */
export type DecisionSummaryRecord = {
  /** 决策主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
  /** 决策背景说明。 */
  description: string | null;
  /** 决策当前状态。 */
  status: DecisionStatus;
  /** 决策所属项目主键。 */
  projectId: number;
  /** 小组级决策所属分区主键；项目级决策为 `null`。 */
  areaId: number | null;
  /** 小组级决策所属分区摘要。 */
  area: { id: number; name: string } | null;
  /** 决策所属项目摘要。 */
  project: { id: number; title: string };
  /** 决策所属部门。 */
  department: DecisionDepartmentRecord;
  /** 决策创建人。 */
  creator: DecisionUserRecord;
  /** 决策负责人。 */
  owner: DecisionUserRecord | null;
  /** 决策参与者聚合统计。 */
  _count: { participants: number };
  /** 决策形成结论的时间。 */
  decidedAt: Date | null;
  /** 决策归档时间。 */
  archivedAt: Date | null;
  /** 决策创建时间。 */
  createdAt: Date;
  /** 决策最后更新时间。 */
  updatedAt: Date;
};

/** 单个决策参与者映射实际读取的查询结果。 */
export type DecisionParticipantRecord = {
  /** 参与关系主键。 */
  id: number;
  /** 参与者在决策中的身份。 */
  role: ParticipantRole;
  /** 参与用户摘要。 */
  user: DecisionUserRecord;
  /** 参与关系创建时间。 */
  createdAt: Date;
};

/** 决策详情映射实际读取的查询结果。 */
export type DecisionDetailRecord = DecisionSummaryRecord & {
  /** 决策参与人列表。 */
  participants: DecisionParticipantRecord[];
};

/** 候选参与者映射实际读取的查询结果。 */
export type DecisionParticipantCandidateRecord = DecisionUserRecord & {
  /** 候选用户所属部门。 */
  department: DecisionDepartmentRecord | null;
};

/** 决策提案映射实际读取的查询结果。 */
export type DecisionProposalRecord = {
  /** 提案主键。 */
  id: number;
  /** 所属决策主键。 */
  decisionId: number;
  /** 可选的提案形成会议主键。 */
  meetingId: number | null;
  /** 提案标题。 */
  title: string;
  /** 提案补充说明。 */
  description: string | null;
  /** 提案当前状态。 */
  status: ProposalStatus;
  /** 提案创建人。 */
  creator: DecisionUserRecord;
  /** 提案被采纳的时间。 */
  acceptedAt: Date | null;
  /** 提案关闭时间。 */
  closedAt: Date | null;
  /** 提案创建时间。 */
  createdAt: Date;
  /** 提案最后更新时间。 */
  updatedAt: Date;
};

/** 决策时间线映射实际读取的事件字段。 */
export type DecisionEventRecord = {
  /** 事件主键。 */
  id: number;
  /** 稳定事件类型。 */
  type: DecisionEventType;
  /** 事件展示标题。 */
  title: string;
  /** 触发事件的用户。 */
  actor: DecisionUserRecord | null;
  /** 事件关联的会议主键。 */
  meetingId: number | null;
  /** 事件关联的提案主键。 */
  proposalId: number | null;
  /** 事件关联的投票轮次主键。 */
  voteRoundId: number | null;
  /** 事件关联的正式决议主键。 */
  resolutionId: number | null;
  /** 事件关联的任务主键。 */
  taskId: number | null;
  /** 事件补充数据。 */
  payload: unknown;
  /** 变更前快照。 */
  before: unknown;
  /** 变更后快照。 */
  after: unknown;
  /** 事件实际发生时间。 */
  occurredAt: Date;
  /** 事件对应的录像偏移毫秒数。 */
  recordingOffsetMs: number | null;
  /** 事件记录创建时间。 */
  createdAt: Date;
};

/** 投票选项映射实际读取的查询结果。 */
type DecisionVoteOptionRecord = {
  /** 投票选项主键。 */
  id: number;
  /** 轮次内稳定选项代码。 */
  code: string;
  /** 选项展示名称。 */
  label: string;
  /** 选项补充说明。 */
  description: string | null;
  /** 选项关联的提案主键。 */
  proposalId: number | null;
  /** 选项稳定展示顺序。 */
  sortOrder: number;
  /** 选项聚合统计。 */
  _count: { choices: number };
};

/** 投票轮次映射实际读取的查询结果。 */
export type DecisionVoteRoundRecord = {
  /** 投票轮次主键。 */
  id: number;
  /** 所属决策主键。 */
  decisionId: number;
  /** 可选的投票发起会议主键。 */
  meetingId: number | null;
  /** 投票标题。 */
  title: string;
  /** 投票补充说明。 */
  description: string | null;
  /** 投票选择规则。 */
  method: DecisionVoteMethod;
  /** 投票生命周期状态。 */
  status: DecisionVoteRoundStatus;
  /** 是否匿名投票。 */
  isAnonymous: boolean;
  /** 法定最少选票数。 */
  quorumCount: number | null;
  /** 单张选票最多选择数。 */
  maxChoices: number | null;
  /** 创建投票的用户摘要。 */
  creator: DecisionUserRecord;
  /** 投票选项及各自选择数。 */
  options: DecisionVoteOptionRecord[];
  /** 当前用户在本轮已经提交的选票。 */
  ballots: Array<{ id: number }>;
  /** 本轮全部选票聚合数。 */
  _count: { ballots: number };
  /** 投票开放时间。 */
  openedAt: Date | null;
  /** 投票关闭或取消时间。 */
  closedAt: Date | null;
  /** 投票轮次创建时间。 */
  createdAt: Date;
  /** 投票轮次最后更新时间。 */
  updatedAt: Date;
};

/** 正式决议映射实际读取的查询结果。 */
export type DecisionResolutionRecord = {
  /** 正式决议主键。 */
  id: number;
  /** 所属决策主键。 */
  decisionId: number;
  /** 可选的决议形成会议主键。 */
  meetingId: number | null;
  /** 来源提案主键。 */
  sourceProposalId: number | null;
  /** 来源投票轮次主键。 */
  sourceVoteRoundId: number | null;
  /** 决议标题。 */
  title: string;
  /** 决议正文和确认理由。 */
  content: string;
  /** 决议用途类型。 */
  kind: ResolutionKind;
  /** 决议有效状态。 */
  status: ResolutionStatus;
  /** 正式确认决议的用户摘要。 */
  decidedBy: DecisionUserRecord;
  /** 决议正式确认时间。 */
  decidedAt: Date;
  /** 决议记录创建时间。 */
  createdAt: Date;
  /** 决议记录最后更新时间。 */
  updatedAt: Date;
};
