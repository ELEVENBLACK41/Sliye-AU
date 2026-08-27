/**
 * 本文件验证已有 Thread 的 POST SSE 响应桥。
 * 测试使用假的 Runtime，不连接 NestJS、数据库或真实模型，只验证 2.7-D 的流生命周期。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AiEvent,
  AiPostStreamRunStatusData,
  AiPostStreamSubmissionData,
} from '@workspace/contracts/ai';

import { createAiPostStreamDecoder } from '../utils/ai-post-stream-codec.ts';
import { createAiPostStreamResponse } from './ai-post-stream-response.server.ts';
import type { AiRuntimeLiveSink } from './ai-runtime-live-sink.server.ts';

/** 创建一个立即执行 Run 的固定提交回执。 */
function createSubmission(runId: string | null = 'run-1'): AiPostStreamSubmissionData {
  return {
    threadId: 'thread-1',
    messageId: 'message-1',
    runId,
    dispatchState: runId ? 'DISPATCHED' : 'QUEUED',
    queueSequence: 1,
    submissionMode: 'NORMAL',
    replayed: false,
  };
}

/** 创建一个最小的已提交文本领域事件。 */
function createEvent(): AiEvent {
  return {
    id: 'event-1',
    runId: 'run-1',
    sequence: 1,
    createdAt: '2026-08-27T00:00:00.000Z',
    type: 'ASSISTANT_TEXT_DELTA',
    data: {
      messageId: 'assistant-1',
      delta: '你好',
      liveDeltaIds: ['delta-1'],
      liveSequenceStart: 1,
      liveSequenceEnd: 1,
    },
  };
}

/** 创建一个已完成 Run 的状态快照。 */
function createCompletedStatus(): AiPostStreamRunStatusData {
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    status: 'COMPLETED',
    cancellationReason: null,
    failureReason: null,
    failureCode: null,
    lastSequence: 1,
  };
}

/** 解码完整响应正文中的所有 SSE 业务帧。 */
async function readFrames(response: Response): Promise<unknown[]> {
  const decoder = createAiPostStreamDecoder();
  const body = await response.text();
  const frames = decoder.push(body);
  decoder.finish();

  return frames;
}

/** 等待一个可手动结束的 Promise。 */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

test('已有 Thread 的 POST 流按 submission、live delta、确认事件、终态和 handoff 顺序返回', async () => {
  let registeredRuntime: Promise<void> | null = null;
  let receivedRunId: string | null = null;

  const response = createAiPostStreamResponse({
    submission: createSubmission(),
    requestId: 'request-1',
    signal: new AbortController().signal,
    startRuntime: async (runId, liveSink) => {
      receivedRunId = runId;
      liveSink.publishLiveDelta({
        threadId: 'thread-1',
        runId,
        messageId: 'assistant-1',
        liveDeltaId: 'delta-1',
        liveSequence: 1,
        delta: '你好',
      });
      liveSink.publishEvent(createEvent());
      liveSink.publishStatus(createCompletedStatus());
    },
    registerRuntime: (callback) => {
      registeredRuntime = callback();
    },
  });

  const frames = await readFrames(response);
  await registeredRuntime;

  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(receivedRunId, 'run-1');
  assert.deepEqual(
    frames.map((frame) => (frame as { event: string }).event),
    ['submission', 'live-delta', 'ai-event', 'run-status', 'stream-handoff'],
  );
  assert.deepEqual((frames[4] as { data: unknown }).data, {
    runId: 'run-1',
    threadId: 'thread-1',
    afterSequence: 1,
    reason: 'POST_STREAM_COMPLETED',
  });
});

test('排队消息只返回 submission，不伪造活跃 Run 流', async () => {
  let runtimeStarted = false;

  const response = createAiPostStreamResponse({
    submission: createSubmission(null),
    requestId: 'request-2',
    signal: new AbortController().signal,
    startRuntime: async () => {
      runtimeStarted = true;
    },
    registerRuntime: () => {
      throw new Error('排队消息不应注册 Runtime');
    },
  });

  const frames = await readFrames(response);

  assert.equal(runtimeStarted, false);
  assert.deepEqual(frames, [{ event: 'submission', data: createSubmission(null) }]);
});

test('客户端断开只关闭 sink，Runtime Promise 仍能完成', async () => {
  const controller = new AbortController();
  const runtimeFinished = createDeferred();
  let liveSink!: AiRuntimeLiveSink;
  let afterPromise: Promise<void> | null = null;

  const response = createAiPostStreamResponse({
    submission: createSubmission(),
    requestId: 'request-3',
    signal: controller.signal,
    startRuntime: async (_runId, sink) => {
      liveSink = sink;
      await runtimeFinished.promise;
    },
    registerRuntime: (callback) => {
      afterPromise = callback();
    },
  });

  const reader = response.body?.getReader();
  assert.ok(reader);
  await reader.read();

  controller.abort();
  runtimeFinished.resolve();
  await afterPromise;

  liveSink.publishLiveDelta({
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'assistant-1',
    liveDeltaId: 'late-delta',
    liveSequence: 2,
    delta: '迟到内容',
  });
  const result = await reader.read();

  assert.equal(result.done, true);
});

test('Runtime Promise 异常在响应头已发送后转换为 stream-error', async () => {
  const response = createAiPostStreamResponse({
    submission: createSubmission(),
    requestId: 'request-4',
    signal: new AbortController().signal,
    startRuntime: async () => {
      throw new Error('runtime failed');
    },
    registerRuntime: (callback) => {
      void callback();
    },
  });

  const frames = await readFrames(response);

  assert.deepEqual(frames.map((frame) => (frame as { event: string }).event), ['submission', 'stream-error']);
  assert.deepEqual((frames[1] as { data: unknown }).data, {
    code: 'COMMON.INTERNAL_ERROR',
    message: 'AI 实时回答暂时不可用，请稍后重试',
    requestId: 'request-4',
  });
});
