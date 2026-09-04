/**
 * 本文件验证 AI 工作区 Thread 活动提示的内存态生命周期。
 * 只覆盖开始、终态提醒、已读清除和旧 Run 隔离，不重复测试既有 SSE 或服务端状态机。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { useAiThreadWorkspaceStore } from './ai-thread-workspace.store.ts';

/** 验证侧栏活动提示只保留当前 Run，并在点击后清除完成提醒。 */
test('Thread activity tracks the latest run and clears its in-memory completion reminder', () => {
  const store = useAiThreadWorkspaceStore;
  const threadId = 'thread-1';

  store.getState().resetForRouteChange();
  store.getState().markThreadRunStarted(threadId, 'run-1');
  assert.deepEqual(store.getState().threadActivityById[threadId], {
    runId: 'run-1',
    status: 'RUNNING',
    isRunning: true,
    hasUnseenCompletion: false,
  });

  store.getState().markThreadRunStatus(threadId, 'run-1', 'COMPLETED');
  assert.equal(store.getState().threadActivityById[threadId]?.isRunning, false);
  assert.equal(store.getState().threadActivityById[threadId]?.hasUnseenCompletion, true);

  store.getState().markThreadActivitySeen(threadId);
  assert.equal(store.getState().threadActivityById[threadId]?.hasUnseenCompletion, false);

  store.getState().markThreadRunStatus(threadId, 'run-2', 'RUNNING');
  store.getState().markThreadRunStatus(threadId, 'run-1', 'FAILED');
  assert.deepEqual(store.getState().threadActivityById[threadId], {
    runId: 'run-2',
    status: 'RUNNING',
    isRunning: true,
    hasUnseenCompletion: false,
  });
});
