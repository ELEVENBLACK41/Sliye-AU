/**
 * 本文件验证 Runtime live sink 的有界缓冲、顺序写出和故障隔离语义。
 * 这些测试是 2.7-C 的长期防回归资产，不连接真实模型或数据库。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiEvent } from '@workspace/contracts/ai';

import { createAiRuntimeLiveSink, type AiRuntimeLiveSinkMessage } from './ai-runtime-live-sink.server.ts';

/** 构造一个最小的助手文本事件。 */
function createEvent(sequence: number): AiEvent {
  return {
    id: `event-${sequence}`,
    runId: 'run-1',
    sequence,
    createdAt: '2026-08-27T00:00:00.000Z',
    type: 'ASSISTANT_TEXT_DELTA',
    data: { messageId: 'assistant-1', delta: `片段-${sequence}` },
  };
}

/** 创建一个可控制释放的 Promise，供慢消费者测试推进写出。 */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

/** 等待当前 sink 的异步写出任务至少运行一个事件循环。 */
function waitForDrain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('live sink 按发布顺序写出事件和状态，并允许主动关闭', async () => {
  const messages: AiRuntimeLiveSinkMessage[] = [];
  const closeReasons: string[] = [];
  const sink = createAiRuntimeLiveSink({
    write: (message) => {
      messages.push(message);
    },
    onClose: (reason) => closeReasons.push(reason),
  });

  sink.publishEvent(createEvent(1));
  sink.publishStatus({
    runId: 'run-1',
    threadId: 'thread-1',
    status: 'RUNNING',
    cancellationReason: null,
    failureReason: null,
    failureCode: null,
    lastSequence: 1,
  });
  await waitForDrain();

  assert.deepEqual(
    messages.map((message) => message.kind),
    ['AI_EVENT', 'RUN_STATUS'],
  );
  sink.close();
  sink.publishEvent(createEvent(2));
  await waitForDrain();

  assert.deepEqual(closeReasons, ['CLIENT_DISCONNECTED']);
  assert.equal(messages.length, 2);
});

test('慢消费者超过有界缓冲后被关闭，Runtime 发布调用不被阻塞', async () => {
  const firstWrite = createDeferred();
  const messages: AiRuntimeLiveSinkMessage[] = [];
  const closeReasons: string[] = [];
  const sink = createAiRuntimeLiveSink({
    maxBufferedMessages: 2,
    write: async (message) => {
      messages.push(message);
      if (messages.length === 1) {
        await firstWrite.promise;
      }
    },
    onClose: (reason) => closeReasons.push(reason),
  });

  sink.publishEvent(createEvent(1));
  await waitForDrain();
  sink.publishEvent(createEvent(2));
  sink.publishEvent(createEvent(3));
  sink.publishEvent(createEvent(4));
  firstWrite.resolve();
  await waitForDrain();

  assert.deepEqual(
    messages.map((message) => message.kind),
    ['AI_EVENT'],
  );
  assert.deepEqual(closeReasons, ['SLOW_CONSUMER']);
});

test('写入器失败只关闭当前 sink，不向发布方抛出异常', async () => {
  const closeReasons: string[] = [];
  const sink = createAiRuntimeLiveSink({
    write: async () => {
      throw new Error('client disconnected');
    },
    onClose: (reason) => closeReasons.push(reason),
  });

  assert.doesNotThrow(() => sink.publishEvent(createEvent(1)));
  await waitForDrain();

  assert.deepEqual(closeReasons, ['WRITER_FAILED']);
});
