/**
 * 本文件把已持久化的 Run 事件转换为浏览器可订阅的 SSE 流。
 *
 * 该流永远不会启动执行器：它只按服务端事件序号补拉已经落库的事件，
 * 因此刷新、重连和多标签页订阅都不会产生第二个执行器，也不会重复计费。
 * 浏览器断开只会停止本次订阅，不影响正在进行的运行。
 */
import 'server-only';

import type { AiRunStatus } from '@workspace/contracts/ai';

import { requestNest } from '@/services/bff-request';

/** 两次补拉之间的等待时间。 */
const EVENT_POLL_INTERVAL_MS = 400;

/** 单次订阅允许保持的最长时间，超过后由浏览器重新发起订阅。 */
const MAX_STREAM_DURATION_MS = 10 * 60 * 1000;

/** 已经不会再产生新事件的 Run 终态。 */
const TERMINAL_RUN_STATUSES: ReadonlySet<string> = new Set([
  'CANCELLED',
  'COMPLETED',
  'FAILED',
]);

/** NestJS 事件补拉接口返回的一页事件与 Run 状态快照。 */
type AiRunEventPage = {
  runId: string;
  threadId: string;
  status: AiRunStatus;
  cancellationReason: string | null;
  failureReason: string | null;
  failureCode: string | null;
  events: Array<{
    id: string;
    runId: string;
    sequence: number;
    type: string;
    data: unknown;
    createdAt: string;
  }>;
  lastSequence: number;
  hasMore: boolean;
};

/** 创建一个按事件序号补拉的 SSE 响应。 */
export function createAiRunEventStreamResponse(input: {
  /** 需要订阅的 Run 标识。 */
  runId: string;
  /** 浏览器已经收到的最后一个事件序号。 */
  afterSequence: number;
  /** 当前用户的访问令牌，用于向 NestJS 发起受权限保护的查询。 */
  accessToken: string;
  /** 浏览器断开时触发的中止信号。 */
  signal: AbortSignal;
}): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = input.afterSequence;
      const deadline = Date.now() + MAX_STREAM_DURATION_MS;

      try {
        while (!input.signal.aborted && Date.now() < deadline) {
          const upstream = await requestNest<AiRunEventPage>(
            `/ai/runs/${encodeURIComponent(input.runId)}/events?afterSequence=${cursor}`,
            { headers: { Authorization: `Bearer ${input.accessToken}` } },
          );

          if (!upstream.body.success) {
            controller.enqueue(
              encoder.encode(
                toServerSentEvent('stream-error', {
                  code: upstream.body.code,
                  message: upstream.body.message,
                }),
              ),
            );
            break;
          }

          const page = upstream.body.data;

          for (const event of page.events) {
            controller.enqueue(encoder.encode(toServerSentEvent('ai-event', event)));
          }

          cursor = page.lastSequence;
          controller.enqueue(
            encoder.encode(
              toServerSentEvent('run-status', {
                runId: page.runId,
                threadId: page.threadId,
                status: page.status,
                cancellationReason: page.cancellationReason,
                failureReason: page.failureReason,
                failureCode: page.failureCode,
                lastSequence: cursor,
              }),
            ),
          );

          if (TERMINAL_RUN_STATUSES.has(page.status) && !page.hasMore) {
            break;
          }

          if (!page.hasMore) {
            await waitBeforeNextPoll(input.signal);
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** 在下一次补拉前等待，浏览器断开时立即结束等待。 */
function waitBeforeNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, EVENT_POLL_INTERVAL_MS);

    /** 浏览器断开时立即结束等待，避免多保留一个轮询周期。 */
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** 按 SSE 协议序列化一条命名事件。 */
function toServerSentEvent(eventName: string, payload: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
}
