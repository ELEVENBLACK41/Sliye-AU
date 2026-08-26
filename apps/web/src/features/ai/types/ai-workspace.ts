/**
 * 本文件定义 AI 工作区仅在浏览器侧使用的展示模型与请求状态。
 *
 * 类型基于共享 contracts 的响应进行组合，不复制服务端实体，也不把 UI 状态写入 contracts。
 */

import type { AiMessageHistoryItem, AiThreadActiveRun, AiThreadListItem } from '@workspace/contracts/ai';

/** 工作区异步资源的统一加载状态。 */
export type AiWorkspaceLoadState = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

/** 浏览器侧标准领域 SSE 订阅的生命周期状态。 */
export type AiWorkspaceStreamState = 'IDLE' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'ERROR';

/** 侧栏展示的会话预览，当前选中态仅由 URL 的 Thread 标识决定。 */
export type AiWorkspaceThreadPreview = Pick<AiThreadListItem, 'id' | 'title' | 'activeRunId' | 'archivedAt'> & {
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
