/**
 * 本文件定义 `listMyParticipatedDecisions` 的跨端输入与输出契约。
 * 工具只允许服务端从当前 Run 所有者派生参与人身份，不能接受模型传入用户主键；
 * 统计结果按本次实时授权查询重新计算，列表项才对应可登记的 DECISION 来源。
 */

import type {
  DecisionAreaSummary,
  DecisionParticipantRole,
  DecisionScope,
  DecisionStatus,
} from '../decisions/decision.types.ts';

/** `listMyParticipatedDecisions` 单次允许返回的最大列表条数。 */
export const AI_LIST_MY_PARTICIPATED_DECISIONS_MAX_ITEMS = 20 as const;

/** 参与决策统计固定返回的状态顺序，避免模型面对不稳定的对象键顺序。 */
export const AI_PARTICIPATED_DECISION_STATUS_ORDER = [
  'DRAFT',
  'DISCUSSING',
  'RESOLVED',
  'CANCELLED',
  'ARCHIVED',
] as const satisfies readonly DecisionStatus[];

/** 当前用户参与决策列表工具的窄输入。 */
export type ListMyParticipatedDecisionsInput = {
  /** 可选的项目名称模糊筛选词；不传表示覆盖当前用户有权访问的全部项目。 */
  projectQuery?: string;
  /** 可选的项目级或私有小组级决策范围筛选。 */
  scope?: DecisionScope;
  /** 可选的单一决策状态精确筛选。 */
  status?: DecisionStatus;
  /** 是否纳入已归档决策；未传时默认排除 ARCHIVED。 */
  includeArchived?: boolean;
  /** 可选的列表条数；服务端会将其限制在 1 到 20 之间，默认使用 20。 */
  limit?: number;
};

/** 当前用户参与决策列表中的一条受控摘要。 */
export type AiParticipatedDecisionSummary = {
  /** 决策主键；可作为后续决策读取工具的候选标识。 */
  decisionId: number;
  /** 决策标题。 */
  title: string;
  /** 决策所属项目的最小摘要。 */
  project: { id: number; title: string };
  /** 决策作用于整个项目还是一个私有小组。 */
  scope: DecisionScope;
  /** 小组级决策绑定的私有分区；项目级决策为 null。 */
  area: DecisionAreaSummary | null;
  /** 决策当前业务状态。 */
  status: DecisionStatus;
  /** 当前用户在该决策参与关系中的角色。 */
  role: DecisionParticipantRole;
  /** 决策最近更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 当前用户参与决策按状态聚合的一项统计。 */
export type AiParticipatedDecisionStatusCount = {
  /** 被统计的决策状态。 */
  status: DecisionStatus;
  /** 当前授权和筛选条件下该状态的决策数量。 */
  count: number;
};

/** `listMyParticipatedDecisions` 的窄输出。 */
export type ListMyParticipatedDecisionsOutput = {
  /** 当前授权和筛选条件下匹配的决策总数，与 limit 无关。 */
  total: number;
  /** 按固定状态顺序返回的完整统计；数量合计等于 total。 */
  statusCounts: readonly AiParticipatedDecisionStatusCount[];
  /** 按 updatedAt、decisionId 倒序排列的有界决策摘要列表。 */
  decisions: readonly AiParticipatedDecisionSummary[];
  /** 匹配总数超过本次实际列表上限时为 true。 */
  hasMore: boolean;
};
