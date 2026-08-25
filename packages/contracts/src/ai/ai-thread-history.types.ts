/**
 * 本文件定义 AI 会话历史只读接口的共享契约：Thread 游标分页列表与 Thread 详情。
 *
 * 这里只冻结返回结构和游标规则，不包含查询实现、权限判断和排序 SQL。
 * 所有接口都以“当前登录用户即 Thread 所有者”为唯一数据范围，
 * 因此列表项不再重复返回 `ownerUserId`：它恒等于调用方，返回它既冗余也无意义。
 * 越权访问统一表现为“不存在”，不区分“无权”与“不存在”，避免探测他人 Thread 是否存在。
 */

import type { AiRunNonTerminalStatus } from './ai-run.types.ts';

/** Thread 列表允许的归档筛选取值。 */
export const AI_THREAD_LIST_FILTERS = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;

/**
 * Thread 列表的归档筛选条件。
 * `ACTIVE` 只返回未归档会话，`ARCHIVED` 只返回已归档会话，`ALL` 两者都返回。
 * 归档与恢复的写接口属于 2.5-B，本契约只负责读取时的筛选语义。
 */
export type AiThreadListFilter = (typeof AI_THREAD_LIST_FILTERS)[number];

/** Thread 列表单页默认返回条数。 */
export const AI_THREAD_PAGE_DEFAULT_LIMIT = 20;

/** Thread 列表单页允许请求的最大条数，防止一次拉取超长历史。 */
export const AI_THREAD_PAGE_MAX_LIMIT = 50;

/**
 * Thread 列表接口的游标查询参数。
 *
 * 游标规则：
 * - 列表按“最后活动时间倒序”返回，即最近有变化的会话排在最前；
 * - `cursor` 是**服务端生成的不透明字符串**，客户端只能原样回传，不得自行构造或解析。
 *   它内部同时承载排序时间和 Thread 标识，用于在时间相同的会话之间保持稳定顺序，
 *   避免仅按时间分页时出现重复项或漏项；
 * - 不透明还意味着服务端以后调整排序键不会破坏本契约；
 * - 首页请求省略 `cursor`；后续请求传上一页返回的 `nextCursor`；
 * - 更换 `filter` 时必须丢弃旧 `cursor` 重新从首页开始，跨筛选条件复用游标的行为未定义。
 */
export type AiThreadListQuery = {
  /** 上一页返回的不透明游标；首页省略。 */
  cursor?: string;
  /** 单页条数，缺省为 `AI_THREAD_PAGE_DEFAULT_LIMIT`，上限为 `AI_THREAD_PAGE_MAX_LIMIT`。 */
  limit?: number;
  /** 归档筛选条件，缺省为 `ACTIVE`。 */
  filter?: AiThreadListFilter;
};

/**
 * Thread 列表中的单条会话摘要。
 * 只包含侧栏识别与排序所需的字段，不含消息正文、消息数量或任何业务来源信息。
 */
export type AiThreadListItem = {
  /** 对外稳定且不可推断业务数量的 Thread 标识。 */
  id: string;
  /** 默认由首条用户问题截断生成、允许用户后续修改的会话标题。 */
  title: string;
  /** 当前非终态 Run 标识；没有正在处理的 Run 时为 `null`。 */
  activeRunId: string | null;
  /** 用户归档 Thread 的时间；未归档时为 `null`。 */
  archivedAt: string | null;
  /** Thread 创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** Thread 最后一次业务变化时间，也是列表排序与游标的依据，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** Thread 列表的游标分页结果。 */
export type AiThreadPage = {
  /** 按最后活动时间倒序排列的当前页会话。 */
  items: AiThreadListItem[];
  /** 继续向后翻页使用的不透明游标；已经到底时为 `null`。 */
  nextCursor: string | null;
  /** 是否仍有更多会话可以继续拉取。 */
  hasMore: boolean;
};

/**
 * Thread 详情中的当前活跃 Run 摘要。
 *
 * 客户端通过深链接或刷新打开会话时，需要在不额外请求 Run 接口的前提下判断
 * 应该展示“排队中”“生成中”还是“取消中”，以及是否需要订阅事件流，
 * 因此这里返回状态本身而不是只返回标识。
 *
 * 状态刻意收窄为 `AiRunNonTerminalStatus`：活跃 Run 按定义不可能处于终态，
 * Run 一旦收敛为终态，Thread 的 `activeRunId` 会在同一事务内被清空，
 * 此时详情返回 `activeRun: null` 而不是返回一个终态 Run。
 */
export type AiThreadActiveRun = {
  /** 活跃 Run 标识，与 `AiThreadListItem.activeRunId` 一致。 */
  runId: string;
  /** Run 当前的非终态状态，用于区分排队、执行与取消中。 */
  status: AiRunNonTerminalStatus;
  /** Run 创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/**
 * Thread 详情响应。
 *
 * 详情只返回会话自身的元数据与活跃 Run 快照，不内联消息：
 * 消息由独立的游标分页接口按需拉取，避免详情响应随历史增长而无上限膨胀。
 */
export type AiThreadDetail = AiThreadListItem & {
  /** 当前正在执行或排队的 Run 快照；没有活跃 Run 时为 `null`。 */
  activeRun: AiThreadActiveRun | null;
};
