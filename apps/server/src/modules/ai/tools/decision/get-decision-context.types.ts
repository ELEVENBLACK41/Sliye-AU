/**
 * 本文件定义 `getDecisionContext` 工具自身的窄输入/输出契约类型。
 * 这是工具对外暴露的受控字段集合，独立于 decisions 模块内部的查询结果形状，
 * 便于未来内部实现变化时不必联动改动工具契约。这些类型只在 NestJS 内部使用，
 * 本增量不接 BFF、HTTP 或前端展示，因此暂不放入 packages/contracts。
 */

/** `getDecisionContext` 工具的窄输入：必须来自本 Run 已发现候选的决策主键。 */
export type GetDecisionContextInput = {
  /** 待读取的决策主键；不允许模型凭空猜测，必须来自本 Run 的候选发现结果。 */
  decisionId: number;
};

/** 决策当前生效的最新一条正式决议摘要。 */
export type AiDecisionContextResolution = {
  /** 决议主键。 */
  resolutionId: number;
  /** 决议标题。 */
  title: string;
  /** 阶段性、最终或补充决议。 */
  kind: string;
  /** 决议被正式确认时间的 ISO 字符串。 */
  decidedAt: string;
};

/** `getDecisionContext` 工具的窄输出：一项决策的结构化事实。 */
export type GetDecisionContextResult = {
  /** 决策主键。 */
  decisionId: number;
  /** 决策标题。 */
  title: string;
  /** 决策描述摘要；超出上限的部分会被截断，没有描述时为 null。 */
  summary: string | null;
  /** 决策当前状态。 */
  status: string;
  /** 决策所属项目主键。 */
  projectId: number;
  /** 决策所属项目标题。 */
  projectTitle: string;
  /** 决策归属范围：项目级或讨论分区级。 */
  scope: string;
  /** 决策所属讨论分区名称；项目级决策为 null。 */
  areaName: string | null;
  /** 牵头部门名称。 */
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
  /** 决策下的正式决议总数。 */
  resolutionCount: number;
  /** 当前仍然有效的最新一条决议摘要；没有生效决议时为 null。 */
  latestActiveResolution: AiDecisionContextResolution | null;
  /** 决策被正式确认时间的 ISO 字符串；尚未形成决议时为 null。 */
  decidedAt: string | null;
  /** 决策归档时间的 ISO 字符串；未归档时为 null。 */
  archivedAt: string | null;
  /** 决策创建时间的 ISO 字符串。 */
  createdAt: string;
  /** 决策最近更新时间的 ISO 字符串。 */
  updatedAt: string;
};
