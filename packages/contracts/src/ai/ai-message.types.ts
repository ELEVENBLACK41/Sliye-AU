/**
 * 本文件定义 AI Thread 中用于展示和审计的持久化消息共享契约。
 * UIMessage parts 负责可恢复的消息展示结构；工具审计、来源依赖和运行摘要
 * 仍使用独立记录，避免把敏感原始负载当作普通消息正文长期保存。
 */

/** 第一版 AI 会话允许持久化的消息角色。 */
export const AI_MESSAGE_ROLES = ['USER', 'ASSISTANT'] as const;

/** AI 持久化消息的发送方角色。 */
export type AiMessageRole = (typeof AI_MESSAGE_ROLES)[number];

/** 用户输入从写入数据库到被 Run 领取期间的稳定投递状态。 */
export const AI_MESSAGE_DISPATCH_STATES = [
  'QUEUED',
  'DISPATCHED',
  'SUPERSEDED',
] as const;

/** 用户输入当前的投递或替代状态；助手消息固定为 `null`。 */
export type AiMessageDispatchState = (typeof AI_MESSAGE_DISPATCH_STATES)[number];

/** 用户提交输入时选择的行为模式。 */
export const AI_MESSAGE_SUBMISSION_MODES = ['NORMAL', 'STEER'] as const;

/** 普通输入顺序排队，调整方向会替代尚未领取的旧输入。 */
export type AiMessageSubmissionMode = (typeof AI_MESSAGE_SUBMISSION_MODES)[number];

/** AI SDK UIMessage part 的跨应用可序列化表示，具体 part 由 Web Agent 类型约束。 */
export type AiMessageUiPart = Record<string, unknown>;

/** AI SDK UIMessage 可选元数据的跨应用可序列化表示。 */
export type AiMessageMetadata = Record<string, unknown> | null;

/** Thread 中一条具有稳定标识的用户或助手消息。 */
export type AiMessage = {
  /** 对外稳定的消息标识。 */
  id: string;
  /** 消息所属 Thread 标识。 */
  threadId: string;
  /** 生成助手消息的 Run 标识；用户消息固定为 `null`。 */
  runId: string | null;
  /** 用户消息作者主键；助手消息固定为 `null`。 */
  authorUserId: number | null;
  /** 消息由用户提交还是由助手生成。 */
  role: AiMessageRole;
  /** 用户输入的投递状态；助手消息固定为 `null`。 */
  dispatchState: AiMessageDispatchState | null;
  /** 用户输入在 Thread 内由数据库分配的单调队列序号；助手消息固定为 `null`。 */
  queueSequence: number | null;
  /** 用户选择普通发送或调整方向的提交模式；助手消息固定为 `null`。 */
  submissionMode: AiMessageSubmissionMode | null;
  /** 用于历史展示和审计的完整文本正文。 */
  content: string;
  /** AI SDK UIMessage 的完整 parts，作为新格式消息的正文来源。 */
  parts: AiMessageUiPart[];
  /** AI SDK UIMessage 的可选非敏感元数据。 */
  metadata: AiMessageMetadata;
  /** 消息创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};
