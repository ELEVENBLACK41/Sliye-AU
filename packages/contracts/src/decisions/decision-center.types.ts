/**
 * 本文件定义新版决策中心的活动热力图、过程分析与跨项目档案共享契约。
 */
import type { DecisionEventType, DecisionScope, DecisionStatus, DecisionUserSummary } from './decision.types.ts';

/** 当前用户在决策中心热力图中的一天活动聚合结果。 */
export type DecisionCenterActivityDay = {
  /** 业务时区中的日期键，格式为 YYYY-MM-DD。 */
  date: string;
  /** 当天涉及的去重决策数量。 */
  decisionCount: number;
  /** 当天四类个人活动的总数。 */
  eventCount: number;
  /** 当天由当前用户发起的去重会议数量。 */
  meetingCount: number;
  /** 当天由当前用户提交的去重提案数量。 */
  proposalCount: number;
  /** 当天由当前用户实际提交的去重投票轮次数量。 */
  voteCount: number;
  /** 当天由当前用户确认的去重正式决议数量。 */
  resolutionCount: number;
};

/** 当前用户当日活动档案中的一条关键事件。 */
export type DecisionCenterActivityEvent = {
  /** 对应会议事件、提案事件、选票或决议的主键。 */
  id: number;
  /** 事件的稳定业务类型。 */
  type: DecisionEventType;
  /** 面向用户的事件标题。 */
  title: string;
  /** 触发事件的用户；系统事件为 null。 */
  actor: DecisionUserSummary | null;
  /** 事件发生时间。 */
  occurredAt: string;
  /** 事件所属决策的轻量摘要。 */
  decision: {
    /** 决策主键。 */
    id: number;
    /** 决策标题。 */
    title: string;
    /** 所属项目标题。 */
    projectTitle: string;
  };
};

/** 选中日期的个人活动档案。 */
export type DecisionCenterActivityDayDetail = {
  /** 选中日期的聚合统计。 */
  summary: DecisionCenterActivityDay;
  /** 当天按时间倒序排列的关键事件。 */
  events: DecisionCenterActivityEvent[];
};

/** 决策中心个人活动区首屏响应。 */
export type DecisionCenterActivityResponse = {
  /** 过去 365 个连续日期的活动数据。 */
  days: DecisionCenterActivityDay[];
  /** 首屏默认选中的最近活跃日期档案。 */
  initialDay: DecisionCenterActivityDayDetail;
};

/** 决策过程分析使用的稳定指标。 */
export type DecisionCenterProcessMetrics = {
  /** 已形成决议的决策从创建到收口的平均天数；无样本时为 null。 */
  averageCycleDays: number | null;
  /** 已收口决策从开始讨论到形成决议的中位天数；无样本时为 null。 */
  medianDiscussionDays: number | null;
  /** 已结束提案中被采纳提案的比例，取值 0 到 100；无样本时为 null。 */
  proposalAdoptionRate: number | null;
  /** 已开启投票中正常关闭轮次的比例，取值 0 到 100；无样本时为 null。 */
  voteClosureRate: number | null;
  /** 非草稿决策中已形成正式决议的比例，取值 0 到 100；无样本时为 null。 */
  formalResolutionRate: number | null;
  /** 进入讨论后超过停滞阈值仍未产生关键进展的决策数量。 */
  stalledDecisionCount: number;
};

/** 过程观察卡片支持的稳定类别。 */
export type DecisionCenterObservationKind =
  | 'FASTEST_RESOLUTION'
  | 'LONGEST_DISCUSSION'
  | 'MOST_PROPOSALS'
  | 'MOST_PARTICIPANTS'
  | 'RECENT_RESOLUTION'
  | 'CONSENSUS_WITHOUT_VOTE';

/** 从真实过程数据中提取的一条可解释观察。 */
export type DecisionCenterObservation = {
  /** 观察类别，展示层据此选择文案和单位。 */
  kind: DecisionCenterObservationKind;
  /** 观察对应的数值；日期型观察可为 null。 */
  value: number | null;
  /** 日期型观察的发生时间；其他观察为 null。 */
  occurredAt: string | null;
  /** 被观察决策的轻量引用。 */
  decision: {
    /** 决策主键。 */
    id: number;
    /** 决策标题。 */
    title: string;
    /** 所属项目标题。 */
    projectTitle: string;
  };
};

/** 决策中心过程分析区响应。 */
export type DecisionCenterAnalyticsResponse = {
  /** 跨项目过程指标。 */
  metrics: DecisionCenterProcessMetrics;
  /** 由真实数据计算出的过程观察。 */
  observations: DecisionCenterObservation[];
  /** 判定讨论停滞所使用的天数阈值。 */
  stalledThresholdDays: number;
};

/** 跨项目决策档案中的一条只读摘要。 */
export type DecisionCenterArchiveItem = {
  /** 决策主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
  /** 决策背景或目标说明。 */
  description: string | null;
  /** 当前业务状态。 */
  status: DecisionStatus;
  /** 项目级或私有小组级范围。 */
  scope: DecisionScope;
  /** 所属项目摘要。 */
  project: { id: number; title: string };
  /** 小组级决策的分区名称。 */
  area: { id: number; name: string } | null;
  /** 业务责任部门名称。 */
  departmentName: string;
  /** 参与人数。 */
  participantCount: number;
  /** 提案数量。 */
  proposalCount: number;
  /** 投票轮次数量。 */
  voteRoundCount: number;
  /** 正式决议数量。 */
  resolutionCount: number;
  /** 关联会议数量。 */
  meetingCount: number;
  /** 正式收口时间。 */
  decidedAt: string | null;
  /** 创建时间。 */
  createdAt: string;
  /** 最后更新时间。 */
  updatedAt: string;
};

/** 决策中心跨项目档案响应。 */
export type DecisionCenterArchiveResponse = {
  /** 当前页的授权范围内决策档案。 */
  items: DecisionCenterArchiveItem[];
  /** 符合当前筛选条件的档案总数。 */
  total: number;
  /** 当前页码，从 1 开始。 */
  page: number;
  /** 当前页允许返回的最大记录数。 */
  pageSize: number;
  /** 按当前单页数量计算出的总页数；没有记录时为 0。 */
  totalPages: number;
};

/** 决策中心跨项目档案查询条件。 */
export type DecisionCenterArchiveQuery = {
  /** 按决策、项目、部门或分区名称模糊搜索的关键词。 */
  keyword?: string;
  /** 按项目级或小组级范围筛选。 */
  scope?: DecisionScope;
  /** 按决策业务状态筛选。 */
  status?: DecisionStatus;
  /** 页码，从 1 开始，默认 1。 */
  page?: number;
  /** 单页数量，默认 10，最大 50。 */
  pageSize?: number;
};
