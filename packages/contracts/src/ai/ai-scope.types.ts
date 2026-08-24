/**
 * 本文件定义 2.7 动态授权范围、决策候选确认和细粒度历史可见性的共享契约。
 * 契约只描述跨端稳定语义；具体权限查询、持久化结构和 UI 映射由各应用负责。
 */

/** AI 在一次 Run 中解析业务数据范围时可能处于的稳定状态。 */
export type AiRunScopeResolutionStatus = 'UNRESOLVED' | 'AWAITING_CONFIRMATION' | 'RESOLVED';

/** 已解析范围来自用户精确引用或经过候选确认。 */
export type AiRunScopeResolutionMethod = 'EXACT_REFERENCE' | 'USER_CONFIRMED';

/** 当前数据模型中用于说明项目业务归属的部门摘要；部门本身不替代资源权限判断。 */
export type AiScopeDepartmentSummary = {
  /** 部门数据库主键。 */
  id: number;
  /** 部门中文名称。 */
  name: string;
};

/** 动态范围候选所属项目的安全摘要。 */
export type AiScopeProjectSummary = {
  /** 项目数据库主键。 */
  id: number;
  /** 项目当前真实标题。 */
  title: string;
};

/** 小组级决策所属讨论分区的安全摘要。 */
export type AiScopeAreaSummary = {
  /** 讨论分区数据库主键。 */
  id: number;
  /** 讨论分区当前真实名称。 */
  name: string;
};

/** NestJS 完成权限前置过滤后才允许返回给用户确认的一项决策候选。 */
export type AiDecisionScopeCandidate = {
  /** 候选决策的安全摘要。 */
  decision: {
    /** 决策数据库主键；确认时仍需由后端重新鉴权。 */
    id: number;
    /** 决策当前真实标题。 */
    title: string;
  };
  /** 候选决策所属项目。 */
  project: AiScopeProjectSummary;
  /** 候选项目当前的部门归属，仅用于消歧展示。 */
  department: AiScopeDepartmentSummary;
  /** 小组级决策所属分区；项目级决策为 `null`。 */
  area: AiScopeAreaSummary | null;
};

/** 一次 Run 已确认且仍需在每次工具读取时重新鉴权的单项决策范围。 */
export type AiAuthorizedDecisionScope = {
  /** 已确认的决策数据库主键。 */
  decisionId: number;
  /** 决策所属项目数据库主键。 */
  projectId: number;
  /** 小组级决策所属分区主键；项目级决策为 `null`。 */
  areaId: number | null;
};

/** Run 尚未解析出任何业务范围时的稳定快照。 */
export type AiUnresolvedRunScope = {
  /** 当前尚未解析或确认业务范围。 */
  status: 'UNRESOLVED';
  /** 尚无已授权决策范围。 */
  scopes: readonly [];
  /** 尚无需要用户确认的候选。 */
  candidates: readonly [];
  /** 尚无范围解析方式。 */
  resolutionMethod: null;
  /** 尚无范围解析完成时间。 */
  resolvedAt: null;
};

/** Run 找到多个授权候选并等待用户明确选择时的稳定快照。 */
export type AiAwaitingRunScopeConfirmation = {
  /** 当前必须等待用户确认，模型不得自行猜测候选。 */
  status: 'AWAITING_CONFIRMATION';
  /** 用户确认前不形成已授权决策范围。 */
  scopes: readonly [];
  /** 已由后端完成权限过滤且至少包含一项的候选列表。 */
  candidates: readonly [AiDecisionScopeCandidate, ...AiDecisionScopeCandidate[]];
  /** 用户确认前没有最终解析方式。 */
  resolutionMethod: null;
  /** 用户确认前没有范围解析完成时间。 */
  resolvedAt: null;
};

/** Run 已得到一个或多个授权决策范围时的稳定快照。 */
export type AiResolvedRunScope = {
  /** 当前范围已经完成解析，可以交给受限业务工具使用。 */
  status: 'RESOLVED';
  /** 至少包含一项、允许跨项目组合的已授权决策范围。 */
  scopes: readonly [AiAuthorizedDecisionScope, ...AiAuthorizedDecisionScope[]];
  /** 解析完成后不再携带过期候选。 */
  candidates: readonly [];
  /** 本次范围通过精确引用或用户确认得到。 */
  resolutionMethod: AiRunScopeResolutionMethod;
  /** 范围解析完成时间，使用 ISO 8601 字符串。 */
  resolvedAt: string;
};

/** 一次 Run 的动态授权范围解析结果。 */
export type AiRunScopeResolution =
  | AiUnresolvedRunScope
  | AiAwaitingRunScopeConfirmation
  | AiResolvedRunScope;

/** 历史内容因来源变化而不可继续展示时使用的稳定原因。 */
export type AiHistoryContentHiddenReason = 'SOURCE_ACCESS_REVOKED' | 'SOURCE_DELETED';

/**
 * 助手回答、工具结果或引用当前是否允许展示。
 * 隐藏分支不返回失权来源 ID 或旧正文，避免通过占位数据继续泄漏业务信息。
 */
export type AiHistoryContentVisibility =
  | {
      /** 当前用户仍有权读取该内容依赖的全部来源。 */
      state: 'VISIBLE';
      /** 可见内容没有隐藏原因。 */
      reason: null;
    }
  | {
      /** 当前内容受至少一项失权或删除来源影响，调用方只能展示中性占位。 */
      state: 'HIDDEN';
      /** 服务端允许前端映射为稳定提示的隐藏原因。 */
      reason: AiHistoryContentHiddenReason;
    };
