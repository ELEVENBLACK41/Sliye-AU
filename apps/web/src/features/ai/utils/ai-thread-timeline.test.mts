/**
 * 本文件验证 AI 持久化历史投影的稳定排序、去重、重试关联和 UI 消息恢复。
 */

import assert from 'node:assert/strict';
import * as nodeModule from 'node:module';
import { test } from 'node:test';

import type {
  AiMessage,
  AiRunPublicSummary,
  AiThreadMessageHistoryItem,
  AiToolCall,
} from '@workspace/contracts/ai';

const TIMESTAMP = '2026-08-23T10:00:00.000Z';

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

const { mergeAiThreadHistoryItems, projectAiThreadTimeline, toAiDecisionUiMessages } = await import(
  './ai-thread-timeline.ts'
);

/** 创建确定性的持久化消息夹具。 */
function createMessage(overrides: Partial<AiMessage> = {}): AiMessage {
  return {
    id: 'message-user-1',
    threadId: 'thread-1',
    runId: null,
    authorUserId: 101,
    role: 'USER',
    content: '为什么形成这项决策？',
    createdAt: TIMESTAMP,
    ...overrides,
  };
}

/** 创建不包含执行租约的 Run 历史夹具。 */
function createRun(overrides: Partial<AiRunPublicSummary> = {}): AiRunPublicSummary {
  return {
    id: 'run-1',
    threadId: 'thread-1',
    userMessageId: 'message-user-1',
    retryOfRunId: null,
    status: 'COMPLETED',
    modelRole: 'standard',
    resolvedModelId: 'mock/model',
    cancellationReason: null,
    failureReason: null,
    failureCode: null,
    usage: null,
    startedAt: TIMESTAMP,
    finishedAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

/** 创建结构化工具审计夹具。 */
function createToolCall(overrides: Partial<AiToolCall> = {}): AiToolCall {
  return {
    id: 'tool-record-1',
    runId: 'run-1',
    toolCallId: 'shared-tool-call',
    sequence: 1,
    toolName: 'getDecisionContext',
    status: 'COMPLETED',
    input: { decisionId: 7 },
    resultSummary: {
      decisionId: 7,
      decisionTitle: '客服平台供应商选型',
      decisionStatus: 'DISCUSSING',
      projectTitle: 'NextNest',
      areaName: null,
      participantCount: 4,
      sourceIds: ['decision:7'],
    },
    errorCode: null,
    startedAt: TIMESTAMP,
    finishedAt: TIMESTAMP,
    durationMs: 25,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

/** 创建一条消息及其 Run 历史夹具。 */
function createHistoryItem(
  message: AiMessage,
  runs: AiThreadMessageHistoryItem['runs'] = [],
): AiThreadMessageHistoryItem {
  return { message, runs };
}

test('历史时间流应按消息、工具、助手正文、引用和 Run 排序并去重', () => {
  const run = createRun();
  const toolCall = createToolCall();
  const userItem = createHistoryItem(createMessage(), [
    {
      run,
      toolCalls: [toolCall, toolCall],
      sourceIds: ['decision:7', 'decision:7'],
    },
  ]);
  const assistantItem = createHistoryItem(
    createMessage({
      id: 'message-assistant-1',
      runId: run.id,
      authorUserId: null,
      role: 'ASSISTANT',
      content: '该决策由供应商成本与交付风险共同推动。',
    }),
  );

  const timeline = projectAiThreadTimeline([assistantItem, userItem, userItem]);

  assert.deepEqual(
    timeline.map((item) => item.id),
    [
      'message:message-user-1',
      'tool:run-1:shared-tool-call',
      'message:message-assistant-1',
      'citations:run-1',
      'run:run-1',
    ],
  );

  const citation = timeline.find((item) => item.kind === 'citations');
  assert.deepEqual(citation?.sourceIds, ['decision:7']);
});

test('重试链复用工具调用 ID 时仍应按 Run 隔离工具、引用和状态', () => {
  const firstRun = createRun({ id: 'run-first', status: 'FAILED', finishedAt: TIMESTAMP });
  const retryRun = createRun({
    id: 'run-retry',
    retryOfRunId: firstRun.id,
    createdAt: '2026-08-23T10:01:00.000Z',
    startedAt: '2026-08-23T10:01:00.000Z',
    finishedAt: '2026-08-23T10:01:00.000Z',
    updatedAt: '2026-08-23T10:01:00.000Z',
  });
  const item = createHistoryItem(createMessage(), [
    {
      run: firstRun,
      toolCalls: [
        createToolCall({
          id: 'tool-record-first',
          runId: firstRun.id,
          status: 'FAILED',
          resultSummary: null,
          errorCode: 'AI_TOOL_EXECUTION_FAILED',
        }),
      ],
      sourceIds: ['decision:7@failed'],
    },
    {
      run: retryRun,
      toolCalls: [
        createToolCall({
          id: 'tool-record-retry',
          runId: retryRun.id,
          startedAt: retryRun.startedAt ?? retryRun.createdAt,
          finishedAt: retryRun.finishedAt,
          createdAt: retryRun.createdAt,
          updatedAt: retryRun.updatedAt,
          resultSummary: {
            ...createToolCall().resultSummary!,
            sourceIds: ['decision:7@retry'],
          },
        }),
      ],
      sourceIds: ['decision:7@retry'],
    },
  ]);

  const timeline = projectAiThreadTimeline([item]);
  const tools = timeline.filter((timelineItem) => timelineItem.kind === 'tool');
  const citations = timeline.filter((timelineItem) => timelineItem.kind === 'citations');
  const runs = timeline.filter((timelineItem) => timelineItem.kind === 'run');

  assert.deepEqual(
    tools.map((tool) => ({ id: tool.id, runId: tool.runId, sourceIds: tool.tool.sourceIds })),
    [
      {
        id: 'tool:run-first:shared-tool-call',
        runId: 'run-first',
        sourceIds: [],
      },
      {
        id: 'tool:run-retry:shared-tool-call',
        runId: 'run-retry',
        sourceIds: ['decision:7@retry'],
      },
    ],
  );
  assert.deepEqual(
    citations.map((citation) => ({ runId: citation.runId, sourceIds: citation.sourceIds })),
    [
      { runId: 'run-first', sourceIds: ['decision:7@failed'] },
      { runId: 'run-retry', sourceIds: ['decision:7@retry'] },
    ],
  );
  assert.equal(runs[1]?.run.retryOfRunId, firstRun.id);
});

test('没有工具记录的排队 Run 不应伪造工具卡', () => {
  const queuedRun = createRun({
    id: 'run-queued',
    status: 'QUEUED',
    resolvedModelId: null,
    startedAt: null,
    finishedAt: null,
  });
  const timeline = projectAiThreadTimeline([
    createHistoryItem(createMessage(), [{ run: queuedRun, toolCalls: [], sourceIds: [] }]),
  ]);

  assert.deepEqual(
    timeline.map((item) => item.id),
    ['message:message-user-1', 'run:run-queued'],
  );
  assert.equal(timeline.some((item) => item.kind === 'tool'), false);
});

test('等待执行的工具应使用创建时间恢复稳定排序', () => {
  const waitingTool = createToolCall({
    status: 'WAITING',
    resultSummary: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  });
  const runningRun = createRun({ status: 'RUNNING', finishedAt: null });
  const timeline = projectAiThreadTimeline([
    createHistoryItem(createMessage(), [
      { run: runningRun, toolCalls: [waitingTool], sourceIds: [] },
    ]),
  ]);
  const tool = timeline.find((item) => item.kind === 'tool');

  assert.equal(tool?.id, `tool:${runningRun.id}:${waitingTool.toolCallId}`);
  assert.equal(tool?.createdAt, waitingTool.createdAt);
  assert.equal(tool?.tool.state, 'waiting');
});

test('消息分页合并应按稳定 ID 去重并让较新快照覆盖旧快照', () => {
  const older = createHistoryItem(createMessage({ id: 'message-older', createdAt: TIMESTAMP }));
  const current = createHistoryItem(
    createMessage({ id: 'message-current', createdAt: '2026-08-23T10:01:00.000Z' }),
  );
  const refreshedCurrent = createHistoryItem(current.message, [
    { run: createRun(), toolCalls: [], sourceIds: [] },
  ]);

  const merged = mergeAiThreadHistoryItems([current], [older, refreshedCurrent]);

  assert.deepEqual(
    merged.map((item) => item.message.id),
    ['message-older', 'message-current'],
  );
  assert.equal(merged[1]?.runs.length, 1);
});

test('持久化消息应保留稳定 ID、角色和正文转换为 UIMessage', () => {
  const items = [
    createHistoryItem(createMessage()),
    createHistoryItem(
      createMessage({
        id: 'message-assistant-1',
        runId: 'run-1',
        authorUserId: null,
        role: 'ASSISTANT',
        content: '这是经持久化恢复的回答。',
        createdAt: '2026-08-23T10:01:00.000Z',
      }),
    ),
  ];

  assert.deepEqual(toAiDecisionUiMessages(items), [
    {
      id: 'message-user-1',
      role: 'user',
      parts: [{ type: 'text', text: '为什么形成这项决策？' }],
    },
    {
      id: 'message-assistant-1',
      role: 'assistant',
      parts: [{ type: 'text', text: '这是经持久化恢复的回答。' }],
    },
  ]);
});
