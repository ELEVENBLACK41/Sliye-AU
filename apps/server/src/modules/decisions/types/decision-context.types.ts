/**
 * 本文件定义决策上下文读取（按主键读取一项已授权决策的结构化事实）的服务端内部返回类型。
 * 这是决策域内部的查询结果形状，不代表对外 HTTP 响应契约；
 * 调用方（例如 AI 工具执行器）应按各自的输出契约自行裁剪或转换字段。
 * 本类型只包含结构化事实与计数，不包含讨论正文、会议转写或提案/投票明细。
 */

import type { DecisionStatus, ResolutionKind } from '../../../generated/prisma';

/** 决策归属范围：项目级决策，或仅属于一个讨论分区的小组决策。 */
export type DecisionContextScope = 'PROJECT' | 'AREA';

/** 决策当前生效的最新一条正式决议摘要，只保留可用于回答的最小字段。 */
export type DecisionContextResolution = {
  /** 决议主键，供来源标识和后续引用使用。 */
  resolutionId: number;
  /** 决议标题。 */
  title: string;
  /** 阶段性、最终或补充决议。 */
  kind: ResolutionKind;
  /** 决议被正式确认的时间。 */
  decidedAt: Date;
};

/** 一项已授权决策的结构化上下文事实。 */
export type DecisionContext = {
  /** 决策主键。 */
  decisionId: number;
  /** 决策标题。 */
  title: string;
  /** 决策描述原文；没有描述时为 null。调用方负责按自身输出契约截断。 */
  description: string | null;
  /** 决策当前状态。 */
  status: DecisionStatus;
  /** 决策所属项目主键。 */
  projectId: number;
  /** 决策所属项目标题。 */
  projectTitle: string;
  /** 决策归属范围。 */
  scope: DecisionContextScope;
  /** 决策所属讨论分区名称；项目级决策为 null。 */
  areaName: string | null;
  /** 牵头部门名称，只表达业务责任归属。 */
  departmentName: string;
  /** 决策负责人展示名；未指定负责人时为 null。 */
  ownerDisplayName: string | null;
  /** 决策创建人展示名。 */
  creatorDisplayName: string;
  /** 决策参与者人数。 */
  participantCount: number;
  /** 决策下的提案总数。 */
  proposalCount: number;
  /** 决策下的投票轮次总数。 */
  voteRoundCount: number;
  /** 决策下的正式决议总数，包含已被替代和已撤销的记录。 */
  resolutionCount: number;
  /** 当前仍然有效的最新一条决议摘要；没有生效决议时为 null。 */
  latestActiveResolution: DecisionContextResolution | null;
  /** 决策被正式确认的时间；尚未形成决议时为 null。 */
  decidedAt: Date | null;
  /** 决策归档时间；未归档时为 null。 */
  archivedAt: Date | null;
  /** 决策创建时间。 */
  createdAt: Date;
  /** 决策最近更新时间。 */
  updatedAt: Date;
};
