/**
 * 本文件定义新版工作台摘要、洞察和决策卡片使用的前后端共享契约。
 */

import type { DecisionStatus } from '../decisions/decision.types.ts';
import type { ProjectStatus } from '../projects/project.types.ts';

/** 工作台把取消和归档决策合并为已结束展示组。 */
export type DashboardDecisionStatusGroup = 'DRAFT' | 'DISCUSSING' | 'RESOLVED' | 'CLOSED';

/** 工作台一类决策状态的真实数量。 */
export type DashboardDecisionStatusCount = {
  /** 工作台稳定展示组。 */
  status: DashboardDecisionStatusGroup;
  /** 当前用户可见范围内的决策数量。 */
  count: number;
};

/** 工作台顶部个人参与统计。 */
export type DashboardParticipationStatistics = {
  /** 当前用户作为成员加入的项目数量，包含已归档项目。 */
  projectCount: number;
  /** 当前用户作为参与人加入的决策数量。 */
  decisionCount: number;
  /** 当前用户在可见决策中提交的提案数量。 */
  proposalCount: number;
};

/** 工作台顶部摘要响应。 */
export type DashboardSummaryResponse = {
  /** 当前用户可见决策的状态分组。 */
  decisionStatuses: DashboardDecisionStatusCount[];
  /** 当前用户的项目、决策和提案参与统计。 */
  participation: DashboardParticipationStatistics;
};

/** 工作台正式决策月度趋势中的单月数据。 */
export type DashboardResolutionTrendItem = {
  /** 公历月份，取值 1 到 12。 */
  month: number;
  /** 当月形成正式决策的数量。 */
  count: number;
};

/** 工作台已结束提案的采纳结果。 */
export type DashboardProposalAdoption = {
  /** 状态为已采纳的提案数量。 */
  acceptedCount: number;
  /** 状态为拒绝或取消的提案数量。 */
  notAcceptedCount: number;
};

/** 工作台一类项目状态的真实数量。 */
export type DashboardProjectStatusCount = {
  /** 项目稳定生命周期状态。 */
  status: ProjectStatus;
  /** 当前用户参与的该状态项目数量。 */
  count: number;
};

/** 工作台卡片堆中的一项进行中决策摘要。 */
export type DashboardDecisionStackItem = {
  /** 决策数据库主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
  /** 决策当前业务状态。 */
  status: DecisionStatus;
  /** 决策所属项目标题。 */
  projectTitle: string;
  /** 当前决策参与人数。 */
  participantCount: number;
  /** 当前决策提案数量。 */
  proposalCount: number;
};

/** 工作台分析卡片和决策卡片堆响应。 */
export type DashboardInsightsResponse = {
  /** 趋势所属的公历年份。 */
  year: number;
  /** 趋势截至的公历月份。 */
  throughMonth: number;
  /** 从一月至当前月份的正式决策趋势。 */
  resolutionTrend: DashboardResolutionTrendItem[];
  /** 当前用户可见范围内已结束提案的采纳结果。 */
  proposalAdoption: DashboardProposalAdoption;
  /** 当前用户参与项目的状态分组。 */
  projectStatuses: DashboardProjectStatusCount[];
  /** 最近更新且仍在推进中的决策卡片。 */
  decisionStack: DashboardDecisionStackItem[];
};
