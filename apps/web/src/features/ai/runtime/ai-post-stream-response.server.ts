/**
 * 本文件把 Runtime live sink 桥接为一次 POST 请求的 SSE 响应。
 *
 * 提交结果先作为 submission 帧发送；有 Run 时继续接收即时增量、持久化确认和
 * 终态状态。客户端断开只关闭当前 sink，Runtime Promise 仍由 Route Handler 的
 * after 注册托管，避免断开连接意外取消模型执行。
 */

import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  AiPostStreamFrame,
  AiPostStreamHandoffReason,
  AiPostStreamSubmissionData,
} from '@workspace/contracts/ai';

import {
  createAiRuntimeLiveSink,
  type AiRuntimeLiveSink,
  type AiRuntimeLiveSinkCloseReason,
  type AiRuntimeLiveSinkMessage,
} from './ai-runtime-live-sink.server.ts';

/** 启动一个已提交 AI Run 的 Runtime 函数。 */
export type AiPostStreamRuntimeStarter = (runId: string, liveSink: AiRuntimeLiveSink) => Promise<void>;

/** POST 直出流响应桥的依赖与提交数据。 */
export type AiPostStreamResponseOptions = {
  /** NestJS 幂等提交后返回的权威投递结果。 */
  submission: AiPostStreamSubmissionData;
  /** 用于流开始后异常的链路请求标识。 */
  requestId: string;
  /** 浏览器请求断开信号；只影响当前 sink。 */
  signal: AbortSignal;
  /** 启动 Runtime 并把 live sink 注入执行链。 */
  startRuntime: AiPostStreamRuntimeStarter;
  /** 注册需要在响应生命周期内继续等待的 Runtime Promise。 */
  registerRuntime: (callback: () => Promise<void>) => void;
  /** 当前响应允许缓存的最大 live sink 消息数。 */
  maxBufferedMessages?: number;
};

/** 创建一条符合 2.7-D 协议的 POST SSE 响应。 */
export function createAiPostStreamResponse(options: AiPostStreamResponseOptions): Response {
  const encoder = new TextEncoder();
  let disconnectClient: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    /** 初始化提交帧、live sink 和 Runtime Promise。 */
    start(controller) {
      let closed = false;
      let lastSequence = 0;
      let liveSink: AiRuntimeLiveSink | null = null;

      /** 移除请求断开监听，避免响应结束后保留当前订阅闭包。 */
      function removeAbortListener(): void {
        options.signal.removeEventListener('abort', disconnectClient ?? noop);
      }

      /** 关闭响应控制器；重复关闭和客户端已取消都安全忽略。 */
      function closeResponse(): void {
        if (closed) {
          return;
        }

        closed = true;
        removeAbortListener();

        try {
          controller.close();
        } catch {
          // 客户端已经取消时，ReadableStream 控制器可能已进入关闭态。
        }
      }

      /** 向响应写入一条命名 SSE 帧。 */
      function writeFrame(frame: AiPostStreamFrame): void {
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(toServerSentEvent(frame)));
      }

      /** 客户端断开时只关闭 sink 和响应，不中止 Runtime。 */
      function disconnect(): void {
        if (closed) {
          return;
        }

        closeResponse();
        liveSink?.close('CLIENT_DISCONNECTED');
      }

      /** live sink 关闭时交给 GET SSE 从最后确认序号恢复。 */
      function handleSinkClose(reason: AiRuntimeLiveSinkCloseReason): void {
        if (reason === 'CLIENT_DISCONNECTED' || reason === 'WRITER_FAILED') {
          closeResponse();
          return;
        }

        writeHandoff('LIVE_SINK_CLOSED');
      }

      /** 发送恢复游标并结束当前 POST 响应。 */
      function writeHandoff(reason: AiPostStreamHandoffReason): void {
        if (closed || options.submission.runId === null) {
          return;
        }

        writeFrame({
          event: 'stream-handoff',
          data: {
            runId: options.submission.runId,
            threadId: options.submission.threadId,
            afterSequence: lastSequence,
            reason,
          },
        });
        closeResponse();
      }

      /** 把 Runtime live sink 消息转换为 POST 直出流帧。 */
      function writeRuntimeMessage(message: AiRuntimeLiveSinkMessage): void {
        if (message.kind === 'LIVE_DELTA') {
          writeFrame({ event: 'live-delta', data: message.liveDelta });
          return;
        }

        if (message.kind === 'AI_EVENT') {
          lastSequence = Math.max(lastSequence, message.event.sequence);
          writeFrame({ event: 'ai-event', data: message.event });
          return;
        }

        lastSequence = Math.max(lastSequence, message.status.lastSequence);
        writeFrame({ event: 'run-status', data: message.status });
      }

      /** 将未预期的 Runtime Promise 拒绝转换为终端流错误帧。 */
      function writeRuntimeError(): void {
        if (closed) {
          return;
        }

        writeFrame({
          event: 'stream-error',
          data: {
            code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
            message: 'AI 实时回答暂时不可用，请稍后重试',
            requestId: options.requestId,
          },
        });
        closeResponse();
        liveSink?.close('RUNTIME_FAILED');
      }

      /** 等待 Runtime 与 sink 写出完成后发送正常结束 handoff。 */
      async function finishRuntime(runtimePromise: Promise<void>): Promise<void> {
        try {
          await runtimePromise;
          await liveSink?.waitForIdle();
          writeHandoff('POST_STREAM_COMPLETED');
        } catch {
          writeRuntimeError();
        }
      }

      disconnectClient = disconnect;
      options.signal.addEventListener('abort', disconnect, { once: true });
      writeFrame({ event: 'submission', data: options.submission });

      if (options.submission.runId === null) {
        closeResponse();
        return;
      }

      liveSink = createAiRuntimeLiveSink({
        maxBufferedMessages: options.maxBufferedMessages,
        write: writeRuntimeMessage,
        onClose: handleSinkClose,
      });

      if (options.signal.aborted) {
        disconnect();
      }

      const runtimePromise = Promise.resolve().then(() =>
        options.startRuntime(options.submission.runId as string, liveSink as AiRuntimeLiveSink),
      );
      const completionPromise = finishRuntime(runtimePromise);
      options.registerRuntime(() => completionPromise);
      void completionPromise;
    },
    /** ReadableStream 被取消时按客户端断开处理。 */
    cancel() {
      disconnectClient?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** 把直出帧编码为可持续写入响应的 SSE 文本。 */
function toServerSentEvent(frame: AiPostStreamFrame): string {
  return `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
}

/** 提供稳定的空监听器，供移除 abort 监听时避免重复创建函数。 */
function noop(): void {}
