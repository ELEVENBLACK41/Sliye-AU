/**
 * 本文件定义 AI 评测 Gold Query V1 的后端内部不可变数据合同，
 * 用于在不接入生产逻辑的前提下描述第一条决策形成过程用户故事的评测输入。
 */

/** Gold Query 评测数据集使用的稳定版本标识。 */
export type AiGoldQueryDatasetVersion = string;

/** Gold Query 的七类评测问题分类。 */
export type AiGoldQueryCategory =
  /** 可由结构化事实直接核验的问题。 */
  | 'exact_fact'
  /** 关注决策过程先后顺序和关键节点的问题。 */
  | 'timeline'
  /** 需要从讨论或会议材料中理解语义的问题。 */
  | 'semantic'
  /** 对两个或多个提案、观点或结果进行比较的问题。 */
  | 'comparison'
  /** 验证无答案、证据不足或否定事实处理的问题。 */
  | 'negative_or_no_answer'
  /** 验证当前用户权限边界和越权防护的问题。 */
  | 'permission'
  /** 验证提示注入等恶意内容不会突破系统边界的问题。 */
  | 'adversarial';

/** Gold Query 可引用的第一条用户故事证据来源类型。 */
export type AiGoldQuerySourceType =
  /** 决策实体本身。 */
  | 'decision'
  /** 决策讨论区域中的单条消息。 */
  | 'discussion_message'
  /** 决策过程时间线事件。 */
  | 'decision_event'
  /** 决策提案。 */
  | 'proposal'
  /** 决策投票轮次及允许公开的汇总信息。 */
  | 'vote_round'
  /** 已正式确认的决议。 */
  | 'resolution'
  /** 与决策过程有关的会议记录。 */
  | 'meeting_record';

/**
 * Gold Query 可标注为禁止检索、引用或泄露的来源类型。
 * 单张选票仅用于权限与匿名投票泄漏诱饵，不能作为第一条用户故事的相关证据。
 */
export type AiGoldQueryForbiddenSourceType =
  | AiGoldQuerySourceType
  /** 单张用户选票，仅可作为匿名投票泄漏诱饵。 */
  | 'vote_ballot';

/** 项目级 Gold Query 本次请求目标的最小范围，不表示后端已完成授权。 */
type AiGoldQueryProjectRequestScope = {
  /** 发起评测请求且需要被权限校验的用户主键。 */
  readonly requesterId: number;
  /** 当前请求所属项目主键。 */
  readonly projectId: number;
  /** 当前请求解释的决策主键。 */
  readonly decisionId: number;
  /** 固定表示用户本次请求的目标是项目级决策数据。 */
  readonly scopeLevel: 'project';
  /** 项目级边界没有具体分区，因此固定为 `null`。 */
  readonly areaId: null;
};

/** 分区级 Gold Query 本次请求目标的最小范围，不表示后端已完成授权。 */
type AiGoldQueryAreaRequestScope = {
  /** 发起评测请求且需要被权限校验的用户主键。 */
  readonly requesterId: number;
  /** 当前请求所属项目主键。 */
  readonly projectId: number;
  /** 当前请求解释的决策主键。 */
  readonly decisionId: number;
  /** 固定表示用户本次请求的目标是指定分区内的决策数据。 */
  readonly scopeLevel: 'area';
  /** 分区级边界对应的分区主键。 */
  readonly areaId: number;
};

/**
 * Gold Query 本次请求的目标范围。
 * 该范围仅描述用户希望访问的数据位置，实际是否允许访问仍由后端授权结果决定。
 */
export type AiGoldQueryRequestScope =
  | AiGoldQueryProjectRequestScope
  | AiGoldQueryAreaRequestScope;

/** 用来源类型与数值主键共同定位一条评测证据，避免不同数据表的主键冲突。 */
export type AiGoldQuerySourceReference = {
  /** 证据来源所属的业务类型。 */
  readonly sourceType: AiGoldQuerySourceType;
  /** 证据来源在其所属业务表中的数值主键。 */
  readonly sourceId: number;
};

/** 用禁止来源类型与数值主键共同定位一条泄漏诱饵或其他禁止证据。 */
export type AiGoldQueryForbiddenSourceReference = {
  /** 禁止来源所属的业务类型。 */
  readonly sourceType: AiGoldQueryForbiddenSourceType;
  /** 禁止来源在其所属业务表中的数值主键。 */
  readonly sourceId: number;
};

/** 单条 Gold Query 的允许与拒绝分支共用的不可变评测输入。 */
type AiGoldQueryCommonFields = {
  /** 在同一数据集版本内唯一且跨运行稳定的 Query 标识。 */
  readonly id: string;
  /** 当前 Query 的评测问题分类。 */
  readonly category: AiGoldQueryCategory;
  /** 面向用户的中文问题文本。 */
  readonly question: string;
  /** 用户本次请求目标的数据范围，不代表后端已授权。 */
  readonly requestScope: AiGoldQueryRequestScope;
  /** 即使语义相关也绝不能检索、引用或泄露的来源。 */
  readonly forbiddenSourceReferences: readonly AiGoldQueryForbiddenSourceReference[];
  /** 正确回答必须覆盖的事实、边界或拒答理由要点。 */
  readonly answerKeyPoints: readonly string[];
};

/** 后端预期允许本次请求时的 Gold Query 评测边界。 */
type AiGoldQueryExpectedAllowed = {
  /** 固定表示后端预期允许当前用户访问本次请求目标。 */
  readonly expectedAccess: 'allowed';
  /** 后端允许证据集中，回答或检索应命中的安全原始证据来源。 */
  readonly relevantSourceReferences: readonly AiGoldQuerySourceReference[];
  /**
   * 在已经授权的前提下，系统是否仍应因无答案或证据不足拒答全部或受限部分内容。
   */
  readonly shouldRefuse: boolean;
};

/** 后端预期拒绝本次请求时的 Gold Query 评测边界。 */
type AiGoldQueryExpectedDenied = {
  /** 固定表示后端预期拒绝当前用户访问本次请求目标。 */
  readonly expectedAccess: 'denied';
  /** 权限拒绝时不得存在可供回答或检索的相关安全证据来源。 */
  readonly relevantSourceReferences: readonly [];
  /** 权限拒绝时系统必须拒答，避免越权泄漏。 */
  readonly shouldRefuse: true;
};

/** 单条 Gold Query 的不可变评测输入与预期授权边界。 */
export type AiGoldQueryV1 =
  | (AiGoldQueryCommonFields & AiGoldQueryExpectedAllowed)
  | (AiGoldQueryCommonFields & AiGoldQueryExpectedDenied);

/** 带稳定版本号的 Gold Query V1 数据集。 */
export type AiGoldQueryDatasetV1 = {
  /** 用于复现评测输入的稳定数据集版本。 */
  readonly datasetVersion: AiGoldQueryDatasetVersion;
  /** 属于当前数据集版本的不可变 Gold Query 列表。 */
  readonly queries: readonly AiGoldQueryV1[];
};
