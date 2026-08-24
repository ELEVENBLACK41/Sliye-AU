/**
 * 本文件验证紧凑活动组对全部 Run 状态、工具异常、来源去重和首次流状态的稳定投影。
 */

import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { test } from 'node:test';

import type { AiRunPublicSummary, AiRunStatus } from '@workspace/contracts/ai';

import type { AiToolCallView, AiToolDisplayState } from './ai-tool-call-view.ts';

/** Node 原生类型剥离不补扩展名，测试钩子只为相对生产模块解析 `.ts`。 */
function resolveTestTypeScriptSpecifier(
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
): unknown {
  if (/^\.\.?\//u.test(specifier) && !/\.[cm]?[jt]sx?$/u.test(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }

  return nextResolve(specifier, context);
}

const nodeModuleWithHooks = nodeModule as unknown as {
  /** 注册当前测试进程的同步模块解析钩子。 */
  registerHooks(options: { resolve: typeof resolveTestTypeScriptSpecifier }): void;
};

nodeModuleWithHooks.registerHooks({ resolve: resolveTestTypeScriptSpecifier });

const { createHistoricalAiActivityGroup, createLiveAiActivityGroup } = await import('./ai-activity-view.ts');

/** 创建不包含执行租约的确定性 Run 夹具。 */
function createRun(status: AiRunStatus, overrides: Partial<AiRunPublicSummary> = {}): AiRunPublicSummary {
  return {
    id: `run-${status.toLowerCase()}`,
    threadId: 'thread-1',
    userMessageId: 'message-user-1',
    retryOfRunId: null,
    status,
    modelRole: 'standard',
    resolvedModelId: status === 'QUEUED' ? null : 'mock/model',
    cancellationReason: status === 'CANCELLED' ? 'USER_REQUESTED' : null,
    failureReason: status === 'FAILED' ? 'TOOL_ERROR' : null,
    failureCode: status === 'FAILED' ? 'AI.TOOL_EXECUTION_FAILED' : null,
    usage: null,
    startedAt: status === 'QUEUED' ? null : '2026-08-24T08:00:00.000Z',
    finishedAt: ['CANCELLED', 'COMPLETED', 'FAILED'].includes(status)
      ? '2026-08-24T08:00:01.000Z'
      : null,
    createdAt: '2026-08-24T08:00:00.000Z',
    updatedAt: '2026-08-24T08:00:01.000Z',
    ...overrides,
  };
}

/** 创建只包含活动组允许字段的工具步骤夹具。 */
function createTool(state: AiToolDisplayState, overrides: Partial<AiToolCallView> = {}): AiToolCallView {
  return {
    id: `tool-${state}`,
    title: '读取决策基础上下文',
    state,
    inputSummary: { decisionId: 7 },
    resultSummary:
      state === 'success'
        ? {
            decisionId: 7,
            projectId: 3,
            decisionTitle: '客服平台供应商选型',
            decisionStatus: 'DISCUSSING',
            projectTitle: 'NextNest',
            areaName: null,
            participantCount: 4,
            sourceIds: ['decision:7'],
          }
        : null,
    errorCode: state === 'failed' ? 'AI.TOOL_EXECUTION_FAILED' : null,
    durationMs: ['success', 'failed', 'cancelled'].includes(state) ? 125 : null,
    sourceIds: state === 'success' ? ['decision:7'] : [],
    ...overrides,
  };
}

test('全部 Run 状态都应生成明确标题、状态和展开策略', () => {
  const cases: Array<{
    status: AiRunStatus;
    state: AiToolDisplayState;
    defaultOpen: boolean;
    retryable: boolean;
  }> = [
    { status: 'QUEUED', state: 'waiting', defaultOpen: true, retryable: false },
    { status: 'RUNNING', state: 'running', defaultOpen: true, retryable: false },
    { status: 'WAITING_APPROVAL', state: 'waiting_approval', defaultOpen: true, retryable: false },
    { status: 'CANCELLATION_REQUESTED', state: 'running', defaultOpen: true, retryable: false },
    { status: 'CANCELLED', state: 'cancelled', defaultOpen: true, retryable: true },
    { status: 'COMPLETED', state: 'success', defaultOpen: false, retryable: false },
    { status: 'FAILED', state: 'failed', defaultOpen: true, retryable: true },
  ];

  for (const fixture of cases) {
    const group = createHistoricalAiActivityGroup(createRun(fixture.status), []);
    assert.equal(group.state, fixture.state);
    assert.equal(group.defaultOpen, fixture.defaultOpen);
    assert.equal(group.retryable, fixture.retryable);
    assert.equal(group.steps.length, 1);
    assert.ok(group.title.length > 0);
    assert.ok(group.statusLabel.length > 0);
  }
});

test('成功活动组应去重来源并保留真实步骤顺序', () => {
  const first = createTool('success');
  const second = createTool('success', {
    id: 'tool-second',
    sourceIds: ['decision:7', 'proposal:12'],
  });
  const group = createHistoricalAiActivityGroup(createRun('COMPLETED'), [first, second]);

  assert.equal(group.state, 'success');
  assert.equal(group.sourceCount, 2);
  assert.equal(group.summary, '3 个步骤 · 2 项来源');
  assert.deepEqual(
    group.steps.map((step) => step.id),
    ['run:run-completed', 'tool:tool-success', 'tool:tool-second'],
  );
  assert.match(group.steps[1]?.label ?? '', /^已/u);
});

test('完成 Run 中的失败工具不能被静默折叠为成功', () => {
  const group = createHistoricalAiActivityGroup(createRun('COMPLETED'), [
    createTool('success'),
    createTool('failed'),
  ]);

  assert.equal(group.state, 'failed');
  assert.equal(group.defaultOpen, true);
  assert.equal(group.retryable, false);
  assert.equal(group.statusLabel, '存在失败步骤');
});

test('等待审批和取消工具应覆盖普通运行状态并保持可发现', () => {
  const approval = createHistoricalAiActivityGroup(createRun('RUNNING'), [createTool('waiting_approval')]);
  const cancelled = createHistoricalAiActivityGroup(createRun('RUNNING'), [createTool('cancelled')]);

  assert.equal(approval.state, 'waiting_approval');
  assert.equal(approval.defaultOpen, true);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.defaultOpen, true);
});

test('首次流只使用真实传输状态和已到达工具部件', () => {
  const submitted = createLiveAiActivityGroup({ runId: 'run-live', status: 'submitted', tools: [] });
  const streaming = createLiveAiActivityGroup({
    runId: 'run-live',
    status: 'streaming',
    tools: [createTool('running')],
  });

  assert.equal(submitted.state, 'waiting');
  assert.equal(submitted.steps.length, 1);
  assert.equal(streaming.state, 'running');
  assert.deepEqual(
    streaming.steps.map((step) => step.kind),
    ['run', 'tool'],
  );
});
