/**
 * 本文件定义决策发现查询（按名称/主键查找候选 Decision）的服务端内部返回类型。
 * 这是决策域内部的查询结果形状，不代表对外 HTTP 响应契约；
 * 调用方（例如 AI 工具执行器）应按各自的输出契约自行裁剪或转换字段。
 */

import type { DecisionStatus } from '../../../generated/prisma';
import type { DecisionContextScope } from './decision-context.types';

/** 一条候选 Decision 的最小摘要，只包含消歧所需字段。 */
export type DecisionDiscoveryCandidate = {
  /** 决策主键。 */
  decisionId: number;
  /** 决策标题。 */
  title: string;
  /** 决策所属项目标题，帮助在多个同名决策间消歧。 */
  projectTitle: string;
  /** 决策归属范围；项目级决策为 PROJECT，私有小组决策为 AREA。 */
  scope: DecisionContextScope;
  /** 决策所属私有讨论分区名称；项目级决策为 null。 */
  areaName: string | null;
  /** 决策当前状态。 */
  status: DecisionStatus;
  /** 决策最近更新时间。 */
  updatedAt: Date;
};
