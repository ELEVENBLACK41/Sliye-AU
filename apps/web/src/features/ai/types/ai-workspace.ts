/**
 * 本文件定义 AI 工作区仅在浏览器侧使用的展示模型与请求状态。
 *
 * 类型基于共享 contracts 的响应进行组合，不复制服务端实体，也不把 UI 状态写入 contracts。
 */

import type {
  AiMessageHistoryItem,
  AiMessageSubmissionMode,
  AiRunStatus,
  AiThreadActiveRun,
  AiThreadListItem,
} from '@workspace/contracts/ai';

/** 工作区异步资源的统一加载状态。 */
export type AiWorkspaceLoadState = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

/** 浏览器侧标准领域 SSE 订阅的生命周期状态。 */
export type AiWorkspaceStreamState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

/** 浏览器侧用户命令的生命周期；只反映当前请求，不替代服务端 Run 状态。 */
export type AiWorkspaceCommandState = 'IDLE' | 'SUBMITTING' | 'STOPPING' | 'RETRYING';

/** 当前浏览器会话内侧栏展示的单个 Thread 运行活动投影。 */
export type AiWorkspaceThreadActivity = {
  /** 最近一次活动 Run 标识。 */
  runId: string;
  /** 最近一次已知的 Run 状态。 */
  status: AiRunStatus;
  /** 当前 Run 是否仍在执行或等待执行。 */
  isRunning: boolean;
  /** 当前浏览器会话内是否存在尚未点击查看的完成提醒。 */
  hasUnseenCompletion: boolean;
};

/** 已提交但服务端尚未领取的用户输入展示模型。 */
export type AiWorkspaceQueuedMessage = {
  /** 用户消息的持久化标识。 */
  id: string;
  /** 排队中的真实用户消息正文。 */
  content: string;
  /** 服务端为 Thread 分配的稳定队列序号。 */
  queueSequence: number;
  /** 本次消息使用的提交模式。 */
  submissionMode: AiMessageSubmissionMode;
  /** 调整方向期间，当前 Run 是否正在等待取消确认。 */
  isSteering: boolean;
};

/** 侧栏展示的会话预览，当前选中态仅由 URL 的 Thread 标识决定。 */
export type AiWorkspaceThreadPreview = Pick<
  AiThreadListItem,
  'id' | 'title' | 'activeRunId' | 'pinnedAt' | 'archivedAt'
> & {
  /** 该会话是否与当前 URL 中的 Thread 标识匹配。 */
  isActive: boolean;
};

/** 供工作台组合层消费的 Thread、消息和运行快照。 */
export type AiWorkspaceThreadState = {
  /** 当前 URL 指向的会话详情；新会话工作区为 null。 */
  thread: AiThreadListItem | null;
  /** 详情返回的非终态 Run 摘要；尚未接入 SSE 时仅用于展示快照。 */
  activeRun: AiThreadActiveRun | null;
  /** 已加载的消息按创建时间正序排列。 */
  messages: AiMessageHistoryItem[];
  /** 消息历史向更早方向的下一页游标。 */
  messageCursor: string | null;
  /** 是否仍有更早的消息。 */
  hasMoreMessages: boolean;
};
