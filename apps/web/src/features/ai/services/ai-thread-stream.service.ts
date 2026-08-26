/**
 * 本文件创建 AI Thread 的标准领域 SSE 订阅。
 *
 * EventSource 只负责连接和解析命名事件，重连退避、当前序号和 React 生命周期
 * 由工作区 Hook 管理；这样浏览器不会把领域 SSE 错当成 AI SDK UI Message Stream。
 */

import type { AiEvent, AiRunCancellationReason, AiRunFailureReason, AiRunStatus } from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';

/** SSE 中携带的 Run 状态快照。 */
export type AiRunStreamStatus = {
  /** 运行标识。 */
  runId: string;
  /** Thread 标识。 */
  threadId: string;
  /** 服务端当前 Run 状态。 */
  status: AiRunStatus;
  /** 取消原因；非取消路径为空。 */
  cancellationReason: AiRunCancellationReason | null;
  /** 失败原因；非失败路径为空。 */
  failureReason: AiRunFailureReason | null;
  /** 失败业务错误码；非失败路径为空。 */
  failureCode: ApiErrorCode | null;
  /** 服务端本次补拉页确认的最后序号。 */
  lastSequence: number;
};

/** SSE 终端错误事件的受控结构。 */
export type AiRunStreamError = {
  /** 服务端返回的稳定错误码。 */
  code?: string;
  /** 可安全展示的错误说明。 */
  message: string;
};

/** 一次订阅所需的回调和游标参数。 */
export type AiRunStreamSubscriptionOptions = {
  /** Thread 标识。 */
  threadId: string;
  /** Run 标识。 */
  runId: string;
  /** 从该序号之后开始补拉。 */
  afterSequence: number;
  /** 收到一条领域事件时调用。 */
  onEvent: (event: AiEvent | unknown) => void;
  /** 收到服务端状态快照时调用。 */
  onStatus: (status: AiRunStreamStatus | unknown) => void;
  /** 收到服务端明确错误事件时调用。 */
  onStreamError: (error: AiRunStreamError) => void;
  /** EventSource 连接成功时调用。 */
  onOpen: () => void;
  /** 网络断开或订阅流异常时调用。 */
  onError: () => void;
};

/** 可由 Hook 在路由切换或卸载时调用的订阅句柄。 */
export type AiRunStreamSubscription = {
  /** 关闭当前 EventSource，不影响服务端 Run。 */
  close: () => void;
};

/** 创建一次从指定事件序号开始的标准领域 SSE 订阅。 */
export function subscribeToAiRunStream(options: AiRunStreamSubscriptionOptions): AiRunStreamSubscription {
  const searchParams = new URLSearchParams({
    runId: options.runId,
    afterSequence: String(Math.max(0, options.afterSequence)),
  });
  const source = new EventSource(
    `/api/ai/threads/${encodeURIComponent(options.threadId)}/stream?${searchParams.toString()}`,
    { withCredentials: true },
  );

  source.addEventListener('open', options.onOpen);
  source.addEventListener('ai-event', (event) => {
    options.onEvent(parseJsonEventData((event as MessageEvent<string>).data));
  });
  source.addEventListener('run-status', (event) => {
    options.onStatus(parseJsonEventData((event as MessageEvent<string>).data));
  });
  source.addEventListener('stream-error', (event) => {
    const payload = parseJsonEventData((event as MessageEvent<string>).data);

    options.onStreamError(isAiRunStreamError(payload) ? payload : { message: '实时回答暂时不可用，请稍后重试' });
  });
  source.addEventListener('error', options.onError);

  return {
    close: () => source.close(),
  };
}

/** 解析 SSE data 字段；非法 JSON 保留为未知值交给上层安全处理。 */
function parseJsonEventData(rawData: string): unknown {
  try {
    return JSON.parse(rawData) as unknown;
  } catch {
    return null;
  }
}

/** 判断终端错误事件是否具备可展示的最小结构。 */
function isAiRunStreamError(value: unknown): value is AiRunStreamError {
  return typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string';
}
