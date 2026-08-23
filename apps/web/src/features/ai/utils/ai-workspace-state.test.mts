/**
 * 本文件验证 AI 工作区旧 Run 守卫和活跃状态串行轮询。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AI_THREAD_SCOPE_CHANGED_MESSAGE,
  canApplyAiThreadRequestResult,
  canApplyAiRunSettlementSnapshot,
  runSerialAiActiveRunPoll,
  serializeAiThreadScopeChangedError,
  toAiWorkspaceErrorMessage,
} from './ai-workspace-state.ts';

import { API_ERROR_CODES } from '@workspace/contracts/common';

const CONTEXT = { sessionId: 'session-current', threadId: 'thread-current', runId: 'run-old' };

test('旧 session、旧 Thread 或新活跃 Run 的快照不能覆盖当前工作区', () => {
  assert.equal(
    canApplyAiRunSettlementSnapshot(CONTEXT, 'session-new', 'thread-current', null),
    false,
  );
  assert.equal(
    canApplyAiRunSettlementSnapshot(CONTEXT, 'session-current', 'thread-new', null),
    false,
  );
  assert.equal(
    canApplyAiRunSettlementSnapshot(CONTEXT, 'session-current', 'thread-current', 'run-new'),
    false,
  );
  assert.equal(
    canApplyAiRunSettlementSnapshot(CONTEXT, 'session-current', 'thread-current', null),
    true,
  );
});

test('慢轮询始终单飞并可以应用最终一次结果', async () => {
  let refreshCount = 0;
  let concurrent = 0;
  let maximumConcurrent = 0;

  await runSerialAiActiveRunPoll({
    shouldContinue: () => refreshCount < 3,
    wait: async () => undefined,
    refresh: async () => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 5));
      refreshCount += 1;
      concurrent -= 1;
    },
  });

  assert.equal(refreshCount, 3);
  assert.equal(maximumConcurrent, 1);
});

test('权限范围变化使用稳定提示且失效前的迟到结果不可应用', () => {
  const scopeChangedError = Object.assign(new Error('不应展示的旧业务标题'), {
    code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
  });

  assert.equal(
    toAiWorkspaceErrorMessage(scopeChangedError, '通用失败'),
    AI_THREAD_SCOPE_CHANGED_MESSAGE,
  );
  assert.equal(canApplyAiThreadRequestResult('thread-current', 'thread-current', 1, 2), false);
  assert.equal(canApplyAiThreadRequestResult('thread-current', 'thread-other', 2, 2), false);
  assert.equal(canApplyAiThreadRequestResult('thread-current', 'thread-current', 2, 2), true);
  assert.deepEqual(
    JSON.parse(serializeAiThreadScopeChangedError({
      response: { code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED },
    }) ?? 'null'),
    {
      code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
      message: AI_THREAD_SCOPE_CHANGED_MESSAGE,
    },
  );
});
