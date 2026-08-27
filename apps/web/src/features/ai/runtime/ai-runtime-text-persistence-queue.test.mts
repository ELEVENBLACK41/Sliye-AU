/**
 * 本文件验证 UI-first 文本持久化队列的批量、串行、异步和失败收敛语义。
 * 测试不连接真实数据库；队列是后续 Runtime 与 POST 流的长期回归资产。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiEvent, AiPostStreamLiveDeltaData } from '@workspace/contracts/ai';

import {
  createAiRuntimeTextPersistenceQueue,
  type AiRuntimeTextPersistenceBatch,
} from './ai-runtime-text-persistence-queue.server.ts';

/** 构造固定的即时文本增量。 */
function createLiveDelta(sequence: number, delta = `片段-${sequence}`): AiPostStreamLiveDeltaData {
  return {
    threadId: 'thread-1',
    runId: 'run-1',
    messageId: 'assistant-1',
    liveDeltaId: `delta-${sequence}`,
    liveSequence: sequence,
    delta,
  };
}

/** 构造一个最小的持久化事件回执。 */
function createPersistedEvent(batch: AiRuntimeTextPersistenceBatch): AiEvent {
  return {
    id: `event-${batch.liveSequenceEnd}`,
    runId: batch.runId,
    sequence: batch.liveSequenceEnd,
    createdAt: '2026-08-27T00:00:00.000Z',
    type: 'ASSISTANT_TEXT_DELTA',
    data: {
      messageId: batch.messageId,
      delta: batch.delta,
      liveDeltaIds: batch.liveDeltaIds,
      liveSequenceStart: batch.liveSequenceStart,
      liveSequenceEnd: batch.liveSequenceEnd,
    },
  };
}

/** 等待队列中的异步写入任务至少推进一个事件循环。 */
function waitForQueue(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test('enqueue 不等待数据库，drain 会按顺序聚合并返回持久化确认', async () => {
  const batches: AiRuntimeTextPersistenceBatch[] = [];
  const persistedEvents: AiEvent[] = [];
  const queue = createAiRuntimeTextPersistenceQueue({
    executionLeaseId: 'lease-1',
    maxBatchCharacters: 10_000,
    flushIntervalMs: 10_000,
    persist: async (batch) => {
      batches.push(batch);
      return createPersistedEvent(batch);
    },
    onPersisted: (event) => persistedEvents.push(event),
    onFatalError: () => assert.fail('未预期的持久化失败'),
  });

  queue.enqueue(createLiveDelta(1, '你好'));
  queue.enqueue(createLiveDelta(2, '，世界'));

  assert.equal(batches.length, 0);
  await queue.drain();

  assert.deepEqual(batches, [
    {
      runId: 'run-1',
      executionLeaseId: 'lease-1',
      messageId: 'assistant-1',
      delta: '你好，世界',
      liveDeltaIds: ['delta-1', 'delta-2'],
      liveSequenceStart: 1,
      liveSequenceEnd: 2,
    },
  ]);
  assert.deepEqual(
    persistedEvents.map((event) => event.id),
    ['event-2'],
  );
});

test('达到字符阈值后后台冲刷，数据库慢不会阻塞后续 enqueue', async () => {
  let releasePersist!: () => void;
  const persistGate = new Promise<void>((resolve) => {
    releasePersist = resolve;
  });
  const batches: AiRuntimeTextPersistenceBatch[] = [];
  const queue = createAiRuntimeTextPersistenceQueue({
    executionLeaseId: 'lease-1',
    maxBatchCharacters: 1,
    maxBufferedDeltas: 10,
    persist: async (batch) => {
      batches.push(batch);
      await persistGate;
      return createPersistedEvent(batch);
    },
    onPersisted: () => undefined,
    onFatalError: (error) => assert.fail(String(error)),
  });

  queue.enqueue(createLiveDelta(1, '首'));
  await waitForQueue();
  queue.enqueue(createLiveDelta(2, '次'));
  assert.equal(batches.length, 1);

  releasePersist();
  await queue.drain();

  assert.deepEqual(
    batches.map((batch) => batch.delta),
    ['首', '次'],
  );
});

test('队列超过上限时通知 Runtime 并在 drain 中失败，不静默丢弃为成功', async () => {
  let releasePersist!: () => void;
  const persistGate = new Promise<void>((resolve) => {
    releasePersist = resolve;
  });
  const errors: unknown[] = [];
  const queue = createAiRuntimeTextPersistenceQueue({
    executionLeaseId: 'lease-1',
    maxBatchCharacters: 1,
    maxBufferedDeltas: 1,
    persist: async (batch) => {
      await persistGate;
      return createPersistedEvent(batch);
    },
    onPersisted: () => undefined,
    onFatalError: (error) => errors.push(error),
  });

  queue.enqueue(createLiveDelta(1, '首'));
  await waitForQueue();
  queue.enqueue(createLiveDelta(2, '次'));
  releasePersist();

  await assert.rejects(queue.drain());
  assert.equal(errors.length, 1);
});
