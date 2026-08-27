/**
 * 本文件验证 POST 直出流的 Thread/Run 归属过滤，防止同一 Thread 的旧 Run 事件污染新 Run。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiPostStreamCoordinatorEvent } from '../components/ai-post-stream-provider';

import { isAiPostStreamEventForCurrentRun } from './ai-post-stream-routing.ts';

/** 创建一条带 Run 归属的最小即时文本事件。 */
function createLiveDelta(runId: string): AiPostStreamCoordinatorEvent {
  return {
    kind: 'LIVE_DELTA',
    data: {
      threadId: 'thread-1',
      runId,
      messageId: `message-${runId}`,
      liveDeltaId: `delta-${runId}`,
      liveSequence: 1,
      delta: '内容',
    },
  };
}

/** 创建一条带 Run 归属的流完成事件。 */
function createCompleted(runId: string): AiPostStreamCoordinatorEvent {
  return {
    kind: 'COMPLETED',
    source: 'EXISTING_THREAD',
    message: '继续',
    submission: {
      threadId: 'thread-1',
      messageId: 'message-1',
      runId,
      dispatchState: 'DISPATCHED',
      queueSequence: 1,
      submissionMode: 'NORMAL',
      replayed: false,
    },
    completion: { handoff: null, streamError: null },
  };
}

/** 当前 Run 只接受同一 Run 的事件，旧 Run 的迟到事件全部忽略。 */
test('只接受当前 Run 的直出事件', () => {
  const options = { threadId: 'thread-1', postStreamThreadId: 'thread-1', activeRunId: 'run-2' };

  assert.equal(isAiPostStreamEventForCurrentRun(createLiveDelta('run-1'), options), false);
  assert.equal(isAiPostStreamEventForCurrentRun(createLiveDelta('run-2'), options), true);
  assert.equal(isAiPostStreamEventForCurrentRun(createCompleted('run-1'), options), false);
});

/** 排队提交没有 Run，但仍应允许当前 Thread 接收其提交确认。 */
test('没有 Run 的排队提交按 Thread 接受', () => {
  const submission: AiPostStreamCoordinatorEvent = {
    kind: 'SUBMISSION',
    source: 'EXISTING_THREAD',
    message: '排队消息',
    data: {
      threadId: 'thread-1',
      messageId: 'message-2',
      runId: null,
      dispatchState: 'QUEUED',
      queueSequence: 2,
      submissionMode: 'NORMAL',
      replayed: false,
    },
  };

  assert.equal(
    isAiPostStreamEventForCurrentRun(submission, {
      threadId: 'thread-1',
      postStreamThreadId: 'thread-1',
      activeRunId: 'run-1',
    }),
    true,
  );
});
