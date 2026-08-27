/**
 * 本文件验证已有 Thread 的浏览器 POST SSE Transport。
 * 测试只模拟 BFF Response，覆盖请求头、帧分发、响应头错误和 stream-error 语义。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  AiPostStreamFrame,
  AiPostStreamErrorData,
  AiPostStreamSubmissionData,
} from '@workspace/contracts/ai';

import {
  startAiThreadCreationPostStream,
  startAiThreadMessagePostStream,
} from './ai-thread-post-stream.service.ts';
import { encodeAiPostStreamFrame } from '../utils/ai-post-stream-codec.ts';

/** 创建一个立即执行 Run 的固定提交回执。 */
function createSubmission(): AiPostStreamSubmissionData {
  return {
    threadId: 'thread-1',
    messageId: 'message-1',
    runId: 'run-1',
    dispatchState: 'DISPATCHED',
    queueSequence: 1,
    submissionMode: 'NORMAL',
    replayed: false,
  };
}

/** 创建一个文本确认事件，供 Transport 验证不改写事件负载。 */
function createTextEvent(): AiPostStreamFrame {
  return {
    event: 'ai-event',
    data: {
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
    },
  };
}

/** 创建一个已完成 Run 的状态帧。 */
function createStatusFrame(): AiPostStreamFrame {
  return {
    event: 'run-status',
    data: {
      runId: 'run-1',
      threadId: 'thread-1',
      status: 'COMPLETED',
      cancellationReason: null,
      failureReason: null,
      failureCode: null,
      lastSequence: 1,
    },
  };
}

/** 创建一个 SSE Response，模拟 Next.js BFF 的直出响应。 */
function createSseResponse(frames: AiPostStreamFrame[]): Response {
  return new Response(frames.map(encodeAiPostStreamFrame).join(''), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

test('Transport 发送 JSON POST 并按顺序分发直出帧', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const liveDeltas: string[] = [];
  const statuses: string[] = [];
  const events: unknown[] = [];

  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return createSseResponse([
      { event: 'submission', data: createSubmission() },
      {
        event: 'live-delta',
        data: {
          threadId: 'thread-1',
          runId: 'run-1',
          messageId: 'assistant-1',
          liveDeltaId: 'delta-1',
          liveSequence: 1,
          delta: '你好',
        },
      },
      createTextEvent(),
      createStatusFrame(),
      {
        event: 'stream-handoff',
        data: {
          runId: 'run-1',
          threadId: 'thread-1',
          afterSequence: 1,
          reason: 'POST_STREAM_COMPLETED',
        },
      },
    ]);
  };

  try {
    const handle = startAiThreadMessagePostStream(
      'thread-1',
      { message: '你好', idempotencyKey: 'request-1' },
      {
        onLiveDelta: (liveDelta) => liveDeltas.push(liveDelta.delta),
        onEvent: (event) => events.push(event),
        onStatus: (status) => statuses.push(status.status),
      },
    );
    const submission = await handle.submission;
    const completion = await handle.completion;

    assert.equal(requestUrl, '/api/ai/threads/thread-1/messages');
    assert.equal(requestInit?.method, 'POST');
    assert.equal(new Headers(requestInit?.headers).get('accept'), 'text/event-stream');
    assert.equal(new Headers(requestInit?.headers).get('content-type'), 'application/json');
    assert.equal(submission.runId, 'run-1');
    assert.deepEqual(liveDeltas, ['你好']);
    assert.equal(events.length, 1);
    assert.deepEqual(statuses, ['COMPLETED']);
    assert.equal(completion.handoff?.afterSequence, 1);
    assert.equal(completion.streamError, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Transport 将响应头后的 stream-error 交给调用方，不伪造 Run 终态', async () => {
  const originalFetch = globalThis.fetch;
  const streamError: AiPostStreamErrorData = {
    code: 'COMMON.INTERNAL_ERROR',
    message: '实时回答暂时不可用',
    requestId: 'request-2',
  };
  let receivedError: AiPostStreamErrorData | null = null;

  globalThis.fetch = async () =>
    createSseResponse([
      { event: 'submission', data: createSubmission() },
      { event: 'stream-error', data: streamError },
    ]);

  try {
    const handle = startAiThreadMessagePostStream('thread-1', {
      message: '你好',
      idempotencyKey: 'request-2',
    }, {
      onStreamError: (error) => {
        receivedError = error;
      },
    });
    const completion = await handle.completion;

    assert.deepEqual(receivedError, streamError);
    assert.deepEqual(completion.streamError, streamError);
    assert.equal(completion.handoff, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Transport 在响应头前收到 HTTP 错误时拒绝提交 Promise', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: false,
        code: 'AI.THREAD_NOT_FOUND',
        message: 'AI 会话不存在或无权访问',
        data: null,
        requestId: 'request-3',
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );

  try {
    const handle = startAiThreadMessagePostStream('thread-1', {
      message: '你好',
      idempotencyKey: 'request-3',
    });

    await assert.rejects(handle.submission, (error: unknown) => {
      return error instanceof Error && error.message === 'AI 会话不存在或无权访问';
    });
    await assert.rejects(handle.completion);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('新会话 Transport 使用根 Thread 创建路径并保留同一 submission 协议', async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = '';

  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return createSseResponse([{ event: 'submission', data: createSubmission() }]);
  };

  try {
    const handle = startAiThreadCreationPostStream({
      message: '创建会话',
      idempotencyKey: 'request-4',
    });
    const submission = await handle.submission;
    const completion = await handle.completion;

    assert.equal(requestUrl, '/api/ai/threads');
    assert.equal(submission.threadId, 'thread-1');
    assert.equal(completion.handoff, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
