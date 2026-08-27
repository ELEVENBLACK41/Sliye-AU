/**
 * 本文件提供已有 AI Thread 的 POST SSE Transport。
 *
 * Transport 只负责请求、解码和按事件名分发，不维护 Run 状态；提交 Promise 在
 * `submission` 帧到达后完成，完成 Promise 继续等待 live stream，便于命令状态及时释放。
 */

import type {
  AiEvent,
  AiPostStreamErrorData,
  AiPostStreamHandoffData,
  AiPostStreamLiveDeltaData,
  AiPostStreamRunStatusData,
  AiPostStreamSubmissionData,
  AiThreadMessageSubmissionResult,
  CreateAiThreadMessageRequest,
} from '@workspace/contracts/ai';
import {
  AI_MESSAGE_DISPATCH_STATES,
  AI_MESSAGE_SUBMISSION_MODES,
  AI_RUN_STATUSES,
} from '@workspace/contracts/ai';
import type { ApiErrorResponse } from '@workspace/contracts/common';

import { ApiClientError, requestResponse } from '../../../services/request.ts';
import {
  AiPostStreamProtocolError,
  createAiPostStreamDecoder,
} from '../utils/ai-post-stream-codec.ts';

/** POST SSE Transport 的事件回调。 */
export type AiThreadPostStreamHandlers = {
  /** 收到幂等提交回执时调用。 */
  onSubmission?: (submission: AiPostStreamSubmissionData) => void;
  /** 收到模型即时文本增量时调用。 */
  onLiveDelta?: (liveDelta: AiPostStreamLiveDeltaData) => void;
  /** 收到已持久化领域事件时调用；事件负载继续交给 reducer 校验。 */
  onEvent?: (event: AiEvent | unknown) => void;
  /** 收到 Run 状态快照时调用。 */
  onStatus?: (status: AiPostStreamRunStatusData) => void;
  /** 收到 POST 流恢复提示时调用。 */
  onHandoff?: (handoff: AiPostStreamHandoffData) => void;
  /** 收到响应头后的稳定流错误时调用。 */
  onStreamError?: (error: AiPostStreamErrorData) => void;
};

/** 一次 POST SSE 请求的提交、完成和主动取消句柄。 */
export type AiThreadPostStreamHandle = {
  /** `submission` 帧到达后完成的提交结果。 */
  submission: Promise<AiThreadMessageSubmissionResult>;
  /** 响应体结束后完成；网络/协议错误通过 Promise 拒绝。 */
  completion: Promise<AiThreadPostStreamCompletion>;
  /** 中止浏览器侧读取，不向服务端发送停止 Run 命令。 */
  abort: () => void;
};

/** POST SSE 响应结束时的恢复提示与流错误摘要。 */
export type AiThreadPostStreamCompletion = {
  /** 服务端要求切换 GET 恢复流时携带的游标。 */
  handoff: AiPostStreamHandoffData | null;
  /** 响应头后收到的稳定流错误；没有错误时为空。 */
  streamError: AiPostStreamErrorData | null;
};

/** 向已有 Thread 提交消息并立即开始消费 POST SSE 响应。 */
export function startAiThreadMessagePostStream(
  threadId: string,
  body: CreateAiThreadMessageRequest,
  handlers: AiThreadPostStreamHandlers = {},
): AiThreadPostStreamHandle {
  const abortController = new AbortController();
  let resolveSubmission!: (submission: AiThreadMessageSubmissionResult) => void;
  let rejectSubmission!: (error: unknown) => void;
  let submissionSettled = false;
  const submission = new Promise<AiThreadMessageSubmissionResult>((resolve, reject) => {
    resolveSubmission = resolve;
    rejectSubmission = reject;
  });

  /** 消费 POST SSE 响应并汇总恢复提示。 */
  async function consumeStream(): Promise<AiThreadPostStreamCompletion> {
    const response = await requestResponse(
      `/api/ai/threads/${encodeURIComponent(threadId)}/messages`,
      {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
        },
        body,
        signal: abortController.signal,
      },
    );

    if (!response.ok) {
      throw await createPostStreamResponseError(response, 'AI 消息发送失败，请稍后重试');
    }

    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      throw await createPostStreamResponseError(response, 'AI 消息流响应格式异常，请稍后重试');
    }

    if (!response.body) {
      throw new AiPostStreamProtocolError('AI 消息流响应缺少可读取的响应体');
    }

    const reader = response.body.getReader();
    const decoder = createAiPostStreamDecoder();
    const textDecoder = new TextDecoder();
    let submissionReceived = false;
    let handoff: AiPostStreamHandoffData | null = null;
    let streamError: AiPostStreamErrorData | null = null;

    try {
      while (true) {
        const result = await reader.read();
        const chunk = textDecoder.decode(result.value ?? new Uint8Array(), { stream: !result.done });

        if (chunk.length > 0) {
          for (const frame of decoder.push(chunk)) {
            const next = dispatchPostStreamFrame(frame, handlers);

            if (next.submission) {
              if (submissionReceived) {
                throw new AiPostStreamProtocolError('AI 消息流重复发送 submission 帧');
              }

              submissionReceived = true;
              settleSubmission(next.submission);
            }
            if (next.handoff) {
              if (handoff) {
                throw new AiPostStreamProtocolError('AI 消息流重复发送 stream-handoff 帧');
              }
              handoff = next.handoff;
            }
            if (next.streamError) {
              if (streamError) {
                throw new AiPostStreamProtocolError('AI 消息流重复发送 stream-error 帧');
              }
              streamError = next.streamError;
            }
          }
        }

        if (result.done) break;
      }

      decoder.finish();

      if (!submissionReceived) {
        throw new AiPostStreamProtocolError('AI 消息流结束前没有收到 submission 帧');
      }

      return { handoff, streamError };
    } finally {
      reader.releaseLock();
    }
  }

  /** 将完成 Promise 的异常同步给提交 Promise，避免调用方只等待提交时悬挂。 */
  const completion = consumeStream().catch((error: unknown) => {
    settleSubmissionError(error);
    throw error;
  });

  return {
    submission,
    completion,
    abort: () => abortController.abort(),
  };

  /** 成功收敛提交 Promise，并把同一回执交给业务回调。 */
  function settleSubmission(value: AiPostStreamSubmissionData): void {
    if (submissionSettled) return;

    submissionSettled = true;
    const result: AiThreadMessageSubmissionResult = value;
    resolveSubmission(result);
    handlers.onSubmission?.(value);
  }

  /** 失败收敛提交 Promise；响应头后的错误由完成 Promise 另行处理。 */
  function settleSubmissionError(error: unknown): void {
    if (submissionSettled) return;

    submissionSettled = true;
    rejectSubmission(error);
  }
}

/** 将一条解码后的线协议帧校验并分发给调用方。 */
function dispatchPostStreamFrame(
  frame: { event: string; data: unknown },
  handlers: AiThreadPostStreamHandlers,
): {
  submission?: AiPostStreamSubmissionData;
  handoff?: AiPostStreamHandoffData;
  streamError?: AiPostStreamErrorData;
} {
  switch (frame.event) {
    case 'submission':
      if (!isAiPostStreamSubmissionData(frame.data)) {
        throw new AiPostStreamProtocolError('AI 消息流 submission 帧负载无效');
      }
      return { submission: frame.data };
    case 'live-delta':
      if (!isAiPostStreamLiveDeltaData(frame.data)) {
        throw new AiPostStreamProtocolError('AI 消息流 live-delta 帧负载无效');
      }
      handlers.onLiveDelta?.(frame.data);
      return {};
    case 'ai-event':
      handlers.onEvent?.(frame.data);
      return {};
    case 'run-status':
      if (!isAiPostStreamRunStatusData(frame.data)) {
        throw new AiPostStreamProtocolError('AI 消息流 run-status 帧负载无效');
      }
      handlers.onStatus?.(frame.data);
      return {};
    case 'stream-handoff':
      if (!isAiPostStreamHandoffData(frame.data)) {
        throw new AiPostStreamProtocolError('AI 消息流 stream-handoff 帧负载无效');
      }
      handlers.onHandoff?.(frame.data);
      return { handoff: frame.data };
    case 'stream-error':
      if (!isAiPostStreamErrorData(frame.data)) {
        throw new AiPostStreamProtocolError('AI 消息流 stream-error 帧负载无效');
      }
      handlers.onStreamError?.(frame.data);
      return { streamError: frame.data };
    default:
      throw new AiPostStreamProtocolError(`AI 消息流包含未知事件：${frame.event}`);
  }
}

/** 将非 2xx 或非 SSE 响应转换为共享 ApiClientError。 */
async function createPostStreamResponseError(response: Response, fallbackMessage: string): Promise<ApiClientError> {
  try {
    const body = (await response.json()) as unknown;
    if (isApiErrorResponse(body)) {
      return new ApiClientError({
        status: response.status,
        code: body.code,
        message: body.message || fallbackMessage,
        details: body.details,
        requestId: body.requestId,
      });
    }
  } catch {
    // 非 JSON 错误继续使用脱敏兜底文案。
  }

  return new ApiClientError({
    status: response.status,
    code: 'COMMON.INTERNAL_ERROR',
    message: fallbackMessage,
  });
}

/** 判断值是否为共享 API 失败响应。 */
function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<ApiErrorResponse>;
  return candidate.success === false && typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

/** 校验 POST 流提交帧负载。 */
function isAiPostStreamSubmissionData(value: unknown): value is AiPostStreamSubmissionData {
  if (!isRecord(value)) return false;

  return (
    typeof value.threadId === 'string' &&
    typeof value.messageId === 'string' &&
    (value.runId === null || typeof value.runId === 'string') &&
    isOneOf(value.dispatchState, AI_MESSAGE_DISPATCH_STATES) &&
    isPositiveSafeInteger(value.queueSequence) &&
    isOneOf(value.submissionMode, AI_MESSAGE_SUBMISSION_MODES) &&
    typeof value.replayed === 'boolean'
  );
}

/** 校验 POST 流即时文本帧负载。 */
function isAiPostStreamLiveDeltaData(value: unknown): value is AiPostStreamLiveDeltaData {
  if (!isRecord(value)) return false;

  return (
    typeof value.threadId === 'string' &&
    typeof value.runId === 'string' &&
    typeof value.messageId === 'string' &&
    typeof value.liveDeltaId === 'string' &&
    isPositiveSafeInteger(value.liveSequence) &&
    typeof value.delta === 'string' &&
    value.delta.length > 0
  );
}

/** 校验 POST 流状态帧负载。 */
function isAiPostStreamRunStatusData(value: unknown): value is AiPostStreamRunStatusData {
  if (!isRecord(value)) return false;

  return (
    typeof value.runId === 'string' &&
    typeof value.threadId === 'string' &&
    isOneOf(value.status, AI_RUN_STATUSES) &&
    isNullableString(value.cancellationReason) &&
    isNullableString(value.failureReason) &&
    isNullableString(value.failureCode) &&
    isSafeInteger(value.lastSequence) &&
    value.lastSequence >= 0
  );
}

/** 校验 POST 流恢复提示帧负载。 */
function isAiPostStreamHandoffData(value: unknown): value is AiPostStreamHandoffData {
  if (!isRecord(value)) return false;

  return (
    typeof value.runId === 'string' &&
    typeof value.threadId === 'string' &&
    isSafeInteger(value.afterSequence) &&
    value.afterSequence >= 0 &&
    (value.reason === 'POST_STREAM_COMPLETED' ||
      value.reason === 'LIVE_SINK_CLOSED' ||
      value.reason === 'RECOVERY_REQUIRED')
  );
}

/** 校验 POST 流错误帧负载。 */
function isAiPostStreamErrorData(value: unknown): value is AiPostStreamErrorData {
  if (!isRecord(value)) return false;

  return typeof value.code === 'string' && typeof value.message === 'string' && typeof value.requestId === 'string';
}

/** 判断值是否为指定常量数组中的一个字符串。 */
function isOneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/** 判断值是否为可作为队列/序号使用的安全整数。 */
function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** 判断值是否为正安全整数。 */
function isPositiveSafeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

/** 判断值是否为字符串或 null。 */
function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** 判断值是否为非数组对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
