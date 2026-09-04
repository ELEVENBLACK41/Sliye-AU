/**
 * 本文件定义 `findDecisionCandidates` 工具自身的窄输入/输出契约类型。
 * 这是工具对外暴露的受控字段集合，独立于 decisions 模块内部的查询结果形状，
 * 便于未来内部实现变化时不必联动改动工具契约。这些类型只在 NestJS 内部使用，
 * 本增量不接 BFF、HTTP 或前端展示，因此暂不放入 packages/contracts。
 */

import type { DecisionContextScope } from '../../../decisions/types/decision-context.types';

/** `findDecisionCandidates` 工具的窄输入：用户消息中已提取出的查询词。 */
export type FindDecisionCandidatesInput = {
  /** 待发现的决策名称、别名或可见标识符；当前 Decision 数据模型只有 title 字段，
   * 因此实际按标题模糊匹配，纯数字查询词额外按主键精确匹配。 */
  query: string;
};

/** 单条候选决策的受控摘要，只暴露消歧所需的最小字段。 */
export type AiDecisionCandidate = {
  /** 决策主键，唯一命中后供 getDecisionContext 等后续工具使用。 */
  decisionId: number;
  /** 决策标题。 */
  title: string;
  /** 决策所属项目标题，帮助用户在多个同名决策间消歧。 */
  projectTitle: string;
  /** 决策归属范围；项目级决策为 PROJECT，私有小组决策为 AREA。 */
  scope: DecisionContextScope;
  /** 决策所属私有讨论分区名称；项目级决策为 null。 */
  areaName: string | null;
  /** 决策当前状态。 */
  status: string;
  /** 决策最近更新时间的 ISO 字符串，用于候选排序展示。 */
  updatedAt: string;
};

/** `findDecisionCandidates` 工具的窄输出。 */
export type FindDecisionCandidatesResult = {
  /** 受当前用户权限过滤、且已裁剪到受控数量的候选决策集合。 */
  candidates: AiDecisionCandidate[];
};
