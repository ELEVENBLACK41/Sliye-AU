/**
 * 本文件定义不强制绑定业务数据的 AI Thread 共享契约。
 * Thread 只承担会话容器、归属和当前运行门禁；权威业务范围由每次 Run 独立保存。
 */

import type { AiRunPublicSummary } from './ai-run.types.ts';

/** AI Thread 可被普通用户读取或因业务来源失权而被锁定的范围状态。 */
export const AI_THREAD_SCOPE_STATES = ['ACTIVE', 'LOCKED'] as const;

/** AI Thread 当前的权限范围状态。 */
export type AiThreadScopeState = (typeof AI_THREAD_SCOPE_STATES)[number];

/** 第一版 AI Thread 的锁定原因。 */
export type AiThreadLockReason = 'SCOPE_CHANGED';

/** 一条归属于创建用户、允许不同 Run 使用不同决策范围的持久化 AI 会话。 */
export type AiThread = {
  /** 对外稳定且不可推断业务数量的 Thread 标识。 */
  id: string;
  /** Thread 创建者和唯一拥有者的用户主键。 */
  ownerUserId: number;
  /** 2.6 旧会话的项目兼容提示；新会话未绑定时为 `null`。 */
  projectId: number | null;
  /** 2.6 旧会话的决策兼容提示；新会话未绑定时为 `null`。 */
  decisionId: number | null;
  /** 默认由首条用户问题截断生成、允许用户后续修改的会话标题。 */
  title: string;
  /** 当前非终态 Run 标识；没有正在处理的 Run 时为 `null`。 */
  activeRunId: string | null;
  /** 当前 Thread 是否仍处于创建用户可读取的业务范围内。 */
  scopeState: AiThreadScopeState;
  /** Thread 被锁定的稳定原因；正常可读时为 `null`。 */
  lockReason: AiThreadLockReason | null;
  /** Thread 首次因权限范围变化被锁定的时间；正常可读时为 `null`。 */
  scopeChangedAt: string | null;
  /** 用户归档 Thread 的时间；未归档时为 `null`。 */
  archivedAt: string | null;
  /** Thread 创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** Thread 最后一次业务变化时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** AI Thread 历史列表支持的归档范围。 */
export const AI_THREAD_ARCHIVE_STATES = ['active', 'archived'] as const;

/** AI Thread 历史列表当前查询的归档范围。 */
export type AiThreadArchiveState = (typeof AI_THREAD_ARCHIVE_STATES)[number];

/** 历史列表中一条不暴露内部所有者与权限锁定细节的 AI Thread 摘要。 */
export type AiThreadListItem = {
  /** 对外稳定的 Thread UUID。 */
  id: string;
  /** Thread 所属项目的真实公开标识与标题。 */
  project: {
    /** 项目主键。 */
    id: number;
    /** 项目当前真实标题。 */
    title: string;
  } | null;
  /** 2.6 旧会话兼容决策；新会话没有固定决策时为 `null`。 */
  decision: {
    /** 决策主键。 */
    id: number;
    /** 决策当前真实标题。 */
    title: string;
  } | null;
  /** 用户可修改的会话标题。 */
  title: string;
  /** 当前非终态 Run；没有运行时为空。 */
  activeRunId: string | null;
  /** 按 `createdAt`、Run UUID 倒序确定的最近一次安全运行摘要。 */
  latestRun: AiRunPublicSummary | null;
  /** 用户归档时间；未归档时为空。 */
  archivedAt: string | null;
  /** Thread 创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** Thread 最后一次业务变化时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** AI Thread 详情接口允许浏览器读取的安全业务快照。 */
export type AiThreadDetail = {
  /** 对外稳定的 Thread UUID。 */
  id: string;
  /** Thread 所属项目的真实公开标识与标题。 */
  project: {
    /** 项目主键。 */
    id: number;
    /** 项目当前真实标题。 */
    title: string;
  } | null;
  /** 2.6 旧会话兼容决策；新会话没有固定决策时为 `null`。 */
  decision: {
    /** 决策主键。 */
    id: number;
    /** 决策当前真实标题。 */
    title: string;
  } | null;
  /** 用户可修改的会话标题。 */
  title: string;
  /** 当前非终态 Run；没有运行时为空。 */
  activeRunId: string | null;
  /** 按 `createdAt`、Run UUID 倒序确定的最近一次安全运行摘要。 */
  latestRun: AiRunPublicSummary | null;
  /** 用户归档时间；未归档时为空。 */
  archivedAt: string | null;
  /** Thread 创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** Thread 最后一次业务变化时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 第一版 Thread 白名单更新请求。 */
export type UpdateAiThreadRequest = {
  /** trim 后 1～60 个 Unicode 字符的会话标题；省略时不修改。 */
  title?: string;
  /** `true` 写入归档时间，`false` 清空归档时间；省略时不修改。 */
  archived?: boolean;
};

/** Thread 白名单更新完成后的安全详情响应。 */
export type UpdateAiThreadResponse = {
  /** 已重新鉴权并完成更新的 Thread 详情。 */
  thread: AiThreadDetail;
};

/** AI Thread 历史列表的游标分页查询参数。 */
export type ListAiThreadsQuery = {
  /** 服务端生成的不透明分页游标；首屏省略。 */
  cursor?: string;
  /** 查询未归档或已归档会话；省略时只返回未归档会话。 */
  archiveState?: AiThreadArchiveState;
  /** 可选的单项决策筛选条件。 */
  decisionId?: number;
  /** 单页数量，服务端默认 20 且最大 50。 */
  limit?: number;
};

/** AI Thread 历史列表的一页稳定结果。 */
export type AiThreadPage = {
  /** 按 `updatedAt` 和 Thread UUID 倒序排列的当前页。 */
  items: AiThreadListItem[];
  /** 继续向后查询的服务端不透明游标；没有更多数据时为空。 */
  nextCursor: string | null;
  /** 当前筛选条件下是否仍有更多会话。 */
  hasMore: boolean;
};
