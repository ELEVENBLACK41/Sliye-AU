/**
 * 本文件定义不持久化业务目标的 AI Thread 与创建会话请求共享契约。
 * 项目、决策、会议等查询目标由 Agent 从每次用户消息中解析，不作为 Thread 字段保存。
 */

/** 创建首条消息和 Thread 时使用的共享请求契约。 */
export type CreateAiThreadRequest = {
  /** 创建 Thread 的首条非空用户消息，也是 Agent 解析本次业务目标的原始输入。 */
  message: string;
  /** 当前用户创建请求范围内的幂等键。 */
  idempotencyKey: string;
};

/** 一条只归属于创建用户、不绑定任何业务目标的持久化 AI 会话。 */
export type AiThread = {
  /** 对外稳定且不可推断业务数量的 Thread 标识。 */
  id: string;
  /** Thread 创建者和唯一拥有者的用户主键。 */
  ownerUserId: number;
  /** 默认由首条用户问题截断生成、允许用户后续修改的会话标题。 */
  title: string;
  /** 当前非终态 Run 标识；没有正在处理的 Run 时为 `null`。 */
  activeRunId: string | null;
  /** 用户把会话固定在侧栏的时间；未固定时为 `null`。 */
  pinnedAt: string | null;
  /** 用户归档 Thread 的时间；未归档时为 `null`。 */
  archivedAt: string | null;
  /** Thread 创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** Thread 最后一次业务变化时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};
