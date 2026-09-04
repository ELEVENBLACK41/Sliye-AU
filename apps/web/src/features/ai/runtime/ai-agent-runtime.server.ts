/**
 * 本文件是运行在 Next.js 服务端的 Agent Runtime 模型循环。
 *
 * Runtime 只持有 runId 与执行租约：领取、上下文、工具目录、工具执行、事件、步骤
 * 和终态全部经 NestJS 内部执行接口完成，用户身份与业务权限由 NestJS 现取现算。
 * 浏览器断开不会取消运行；用户主动停止会使租约失效，Runtime 随即停止写入并确认取消。
 */
import 'server-only';

import { isStepCount, streamText, type ModelMessage } from 'ai';
import { randomUUID } from 'node:crypto';
import type {
  AiEvent,
  AiPostStreamLiveDeltaData,
  AiPostStreamRunStatusData,
  AiRuntimeRunStopResult,
  AiRuntimeSession,
} from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';

import { DECISION_HUB_AGENT_INSTRUCTIONS } from '../agents/decision-hub-agent.ts';
import { buildAiAgentTools } from './ai-agent-tools.server.ts';
import { normalizeAiModelError } from './ai-model-error.ts';
import { resolveAiLanguageModel } from './ai-model.server.ts';
import { logAiModelStreamError } from './ai-model-telemetry.server.ts';
import {
  appendAiAssistantTextDelta,
  claimAiRuntimeSession,
  completeAiRuntimeRun,
  confirmAiRuntimeCancellation,
  ensureAiAssistantMessage,
  isAiExecutionLeaseInvalid,
  recordAiRuntimeStep,
  renewAiRuntimeLease,
  settleAiProviderWebSearch,
  startAiProviderWebSearch,
} from './ai-runtime-client.server.ts';
import { runAiRunChain } from './ai-run-chain.ts';
import type { AiRuntimeLiveSink } from './ai-runtime-live-sink.server.ts';
import {
  createAiRuntimeTextPersistenceQueue,
  type AiRuntimeTextPersistenceQueue,
} from './ai-runtime-text-persistence-queue.server.ts';

/** 单轮运行允许的最大模型步骤数，避免工具循环无限进行。 */
const MAX_AGENT_STEPS = 6;

/** 续租间隔；必须明显小于服务端 30 秒租约时长。 */
const LEASE_RENEW_INTERVAL_MS = 10_000;

/** 一条待写入的模型步骤记录。 */
type PendingAgentStep = {
  sequence: number;
  resolvedModelId?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  startedAt: string;
  finishedAt: string;
  providerToolCallIds: string[];
};

/**
 * 启动并等待一个 Agent 执行链完成。
 * 领取是原子的，重复启动不会产生第二个执行器；返回 Promise 让 Next.js `after()`
 * 能托管模型流、续租、终态写入以及同一 Thread 的后续排队 Run。
 */
export async function startAiAgentRun(runId: string, liveSink?: AiRuntimeLiveSink): Promise<void> {
  try {
    await runAiAgentExecution(runId, liveSink);
  } catch (error: unknown) {
    console.error('[ai-agent-runtime] 运行失败', { runId, error });
  }
}

/** 领取并执行当前 Run；直出流结束后把后继排队 Run 交回无订阅者的后台链。 */
export async function runAiAgentExecution(runId: string, liveSink?: AiRuntimeLiveSink): Promise<void> {
  await runAiRunChain(runId, claimAiRuntimeSession, async (session) => {
    const nextRunId = await executeClaimedSession(session, liveSink);

    if (liveSink && nextRunId) {
      // 一条 POST 直出流只拥有当前 Run，后继 Run 重新走后台链，避免不同回答串流。
      void startAiAgentRun(nextRunId);
      return null;
    }

    return nextRunId;
  });
}

/** 执行一次已领取的会话，并返回终态事务领取到的下一个 Run 标识。 */
async function executeClaimedSession(session: AiRuntimeSession, liveSink?: AiRuntimeLiveSink): Promise<string | null> {
  const { execution } = session;
  const abortController = new AbortController();
  const pendingSteps: PendingAgentStep[] = [];
  /** 续租失败会先中止模型流，中止原因不再是原始租约错误，因此单独记录该事实。 */
  const leaseState = { invalidated: false };
  const leaseTimer = startLeaseRenewal(execution.runId, execution.executionLeaseId, abortController, leaseState);

  let assistantMessageId: string | null = null;
  let assistantText = '';
  let liveSequence = 0;
  const persistenceQueue = createAiRuntimeTextPersistenceQueue({
    executionLeaseId: execution.executionLeaseId,
    persist: (batch) => appendAiAssistantTextDelta(batch),
    onPersisted: (event) => publishAiRuntimeLiveEvent(liveSink, event),
    onFatalError: (error) => {
      if (!abortController.signal.aborted) {
        abortController.abort(error);
      }
    },
  });

  try {
    const resolvedModel = resolveAiLanguageModel(execution.modelRole, {
      userId: execution.ownerUserId,
      feature: 'decision-agent',
    });
    const { configuration } = resolvedModel;
    const stepStartedAt = { value: new Date() };
    const webSearchStartedAt = new Map<string, number>();
    const result = streamText({
      model: resolvedModel.model,
      system: DECISION_HUB_AGENT_INSTRUCTIONS,
      messages: toModelMessages(session),
      abortSignal: abortController.signal,
      timeout: resolvedModel.timeout,
      maxOutputTokens: configuration.budget.maxOutputTokens,
      maxRetries: configuration.budget.maxRetries,
      providerOptions: resolvedModel.providerOptions,
      stopWhen: isStepCount(MAX_AGENT_STEPS),
      tools: buildAiAgentTools(
        session.tools,
        {
          runId: execution.runId,
          executionLeaseId: execution.executionLeaseId,
        },
        {
          onCommittedEvents: (events) => publishAiRuntimeLiveEvents(liveSink, events),
        },
      ),
      onChunk: async ({ chunk }) => {
        if (chunk.type === 'tool-call' && chunk.toolName === 'parallel_search' && chunk.providerExecuted === true) {
          webSearchStartedAt.set(chunk.toolCallId, Date.now());
          const recorded = await startAiProviderWebSearch(
            execution.runId,
            {
              executionLeaseId: execution.executionLeaseId,
              providerToolCallId: chunk.toolCallId,
              input: toRecord(chunk.input),
            },
            abortController.signal,
          );
          publishAiRuntimeLiveEvents(liveSink, recorded.events);
          return;
        }

        if (chunk.type === 'tool-result' && chunk.toolName === 'parallel_search' && chunk.providerExecuted === true) {
          const startedAt = webSearchStartedAt.get(chunk.toolCallId) ?? Date.now();
          webSearchStartedAt.delete(chunk.toolCallId);
          const recorded = await settleAiProviderWebSearch(
            execution.runId,
            {
              executionLeaseId: execution.executionLeaseId,
              providerToolCallId: chunk.toolCallId,
              input: toRecord(chunk.input),
              output: toRecord(chunk.output),
              durationMs: Date.now() - startedAt,
            },
            abortController.signal,
          );
          publishAiRuntimeLiveEvents(liveSink, recorded.events);
        }
      },
      onStepEnd: (step) => {
        const finishedAt = new Date();
        pendingSteps.push({
          sequence: step.stepNumber + 1,
          resolvedModelId: step.model.modelId,
          finishReason: step.finishReason,
          inputTokens: step.usage.inputTokens,
          outputTokens: step.usage.outputTokens,
          totalTokens: step.usage.totalTokens,
          startedAt: stepStartedAt.value.toISOString(),
          finishedAt: finishedAt.toISOString(),
          providerToolCallIds: step.toolCalls.map((toolCall) => toolCall.toolCallId),
        });
        stepStartedAt.value = finishedAt;
      },
      onError: ({ error }) => {
        logAiModelStreamError(execution.runId, configuration.role, error);
      },
    });

    for await (const delta of result.textStream) {
      if (delta.length === 0) {
        continue;
      }

      assistantMessageId ??= await ensureAiAssistantMessage(execution.runId, execution.executionLeaseId);
      assistantText += delta;
      liveSequence += 1;
      const liveDelta: AiPostStreamLiveDeltaData = {
        threadId: execution.threadId,
        runId: execution.runId,
        messageId: assistantMessageId,
        liveDeltaId: randomUUID(),
        liveSequence,
        delta,
      };
      publishAiRuntimeLiveDelta(liveSink, liveDelta);
      await persistenceQueue.enqueue(liveDelta); //由于写入速度跟不上模型得生成速度 等待
    }

    await persistenceQueue.drain();
    const usage = await result.usage;
    // 冲刷会清空步骤队列，因此先取出最后一次实际使用的模型标识。
    const resolvedModelId = pendingSteps.at(-1)?.resolvedModelId;
    await flushSteps(execution.runId, execution.executionLeaseId, pendingSteps);

    const settled = await completeAiRuntimeRun({
      runId: execution.runId,
      executionLeaseId: execution.executionLeaseId,
      status: 'COMPLETED',
      assistantMessageContent: assistantText.length > 0 ? assistantText : undefined,
      resolvedModelId,
      usage: {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
      },
    });
    publishAiRuntimeLiveStopResult(liveSink, execution.threadId, settled);

    return settled.nextRunId;
  } catch (error) {
    return await settleFailedRun(
      session,
      error,
      assistantText,
      pendingSteps,
      leaseState.invalidated,
      liveSink,
      persistenceQueue,
    );
  } finally {
    clearInterval(leaseTimer);
  }
}

/**
 * 处理执行失败：租约已失效说明用户已停止或运行已被对账收敛，
 * 此时只确认取消，不再把失败当作模型错误写回。
 */
async function settleFailedRun(
  session: AiRuntimeSession,
  error: unknown,
  assistantText: string,
  pendingSteps: PendingAgentStep[],
  leaseInvalidated: boolean,
  liveSink?: AiRuntimeLiveSink,
  persistenceQueue?: AiRuntimeTextPersistenceQueue,
): Promise<string | null> {
  const { execution } = session;

  if (leaseInvalidated || isAiExecutionLeaseInvalid(error)) {
    return safeConfirmCancellation(execution.runId, execution.threadId, liveSink);
  }

  const normalized = normalizeAiModelError(error);
  logAiModelStreamError(execution.runId, execution.modelRole, error);

  try {
    if (persistenceQueue) {
      try {
        await persistenceQueue.drain();
      } catch (persistenceError: unknown) {
        console.error('[ai-agent-runtime] 文本持久化队列冲刷失败', {
          runId: execution.runId,
          error: persistenceError,
        });
      }
    }
    await flushSteps(execution.runId, execution.executionLeaseId, pendingSteps);
    const settled = await completeAiRuntimeRun({
      runId: execution.runId,
      executionLeaseId: execution.executionLeaseId,
      status: 'FAILED',
      failureReason: 'MODEL_ERROR',
      failureCode: normalized.code,
      assistantMessageContent: assistantText.length > 0 ? assistantText : undefined,
    });
    publishAiRuntimeLiveStopResult(liveSink, execution.threadId, settled, normalized.code);

    return settled.nextRunId;
  } catch (settleError: unknown) {
    if (isAiExecutionLeaseInvalid(settleError)) {
      return safeConfirmCancellation(execution.runId, execution.threadId, liveSink);
    }

    console.error('[ai-agent-runtime] 写入失败终态时出错', {
      runId: execution.runId,
      error: settleError,
    });

    return null;
  }
}

/** 确认取消；确认本身失败时交由服务端过期租约对账收敛，不阻塞当前进程。 */
async function safeConfirmCancellation(
  runId: string,
  threadId: string,
  liveSink?: AiRuntimeLiveSink,
): Promise<string | null> {
  try {
    const settled = await confirmAiRuntimeCancellation(runId);
    publishAiRuntimeLiveStopResult(liveSink, threadId, settled);

    return settled.nextRunId;
  } catch (error: unknown) {
    console.error('[ai-agent-runtime] 确认取消失败', { runId, error });

    return null;
  }
}

/** 发布一条已提交事件；订阅者异常不能反向影响模型循环。 */
function publishAiRuntimeLiveEvent(liveSink: AiRuntimeLiveSink | undefined, event: AiEvent): void {
  publishAiRuntimeLiveEvents(liveSink, [event]);
}

/** 发布模型刚产生的即时文本增量；该调用不等待数据库持久化。 */
function publishAiRuntimeLiveDelta(
  liveSink: AiRuntimeLiveSink | undefined,
  liveDelta: AiPostStreamLiveDeltaData,
): void {
  if (!liveSink) {
    return;
  }

  try {
    liveSink.publishLiveDelta(liveDelta);
  } catch (error: unknown) {
    console.error('[ai-agent-runtime] live sink 发布即时增量失败', {
      runId: liveDelta.runId,
      liveSequence: liveDelta.liveSequence,
      error,
    });
  }
}

/** 按持久化顺序发布已提交事件；没有 sink 时保持原有后台执行行为。 */
function publishAiRuntimeLiveEvents(liveSink: AiRuntimeLiveSink | undefined, events: AiEvent[]): void {
  if (!liveSink) {
    return;
  }

  for (const event of events) {
    try {
      liveSink.publishEvent(event);
    } catch (error: unknown) {
      console.error('[ai-agent-runtime] live sink 发布事件失败', {
        runId: event.runId,
        sequence: event.sequence,
        error,
      });
    }
  }
}

/** 发布终态事务中的事件与状态快照；事件先于快照进入 sink。 */
function publishAiRuntimeLiveStopResult(
  liveSink: AiRuntimeLiveSink | undefined,
  threadId: string,
  result: AiRuntimeRunStopResult,
  failureCode: ApiErrorCode | null = null,
): void {
  publishAiRuntimeLiveEvents(liveSink, result.events);
  if (!liveSink) {
    return;
  }

  const statusEvent = result.events.findLast(
    (event) => event.type === 'RUN_STATUS_CHANGED' && event.data.toStatus === result.status,
  );
  const cancellationReason = statusEvent?.type === 'RUN_STATUS_CHANGED' ? statusEvent.data.cancellationReason : null;
  const failureReason = statusEvent?.type === 'RUN_STATUS_CHANGED' ? statusEvent.data.failureReason : null;
  const status: AiPostStreamRunStatusData = {
    runId: result.runId,
    threadId,
    nextRunId: result.nextRunId,
    status: result.status,
    cancellationReason,
    failureReason,
    failureCode,
    lastSequence: result.lastSequence ?? 0,
  };

  try {
    liveSink.publishStatus(status);
  } catch (error: unknown) {
    console.error('[ai-agent-runtime] live sink 发布状态失败', {
      runId: result.runId,
      status: result.status,
      error,
    });
  }
}

/** 按顺序写入本轮已完成的模型步骤；租约失效时向上抛出由调用方统一处理。 */
async function flushSteps(runId: string, executionLeaseId: string, pendingSteps: PendingAgentStep[]): Promise<void> {
  while (pendingSteps.length > 0) {
    const step = pendingSteps.shift();

    if (!step) {
      return;
    }

    await recordAiRuntimeStep({ runId, executionLeaseId, ...step });
  }
}

/** 周期性续租；租约一旦失效立即中止模型流，避免继续消耗预算和写入被拒绝的数据。 */
function startLeaseRenewal(
  runId: string,
  executionLeaseId: string,
  abortController: AbortController,
  leaseState: { invalidated: boolean },
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    void renewAiRuntimeLease(runId, executionLeaseId).catch((error: unknown) => {
      leaseState.invalidated = isAiExecutionLeaseInvalid(error);

      if (!abortController.signal.aborted) {
        abortController.abort(error);
      }
    });
  }, LEASE_RENEW_INTERVAL_MS);
}

/** 把受预算限制的历史消息与本次用户消息组装为模型消息序列。 */
function toModelMessages(session: AiRuntimeSession): ModelMessage[] {
  const history: ModelMessage[] = session.recentMessages.map((message) =>
    message.role === 'USER'
      ? { role: 'user', content: message.content }
      : { role: 'assistant', content: message.content },
  );

  return [...history, { role: 'user', content: session.execution.userMessageContent }];
}

/** 把 AI SDK 工具输入输出收窄为内部接口接受的 JSON 对象。 */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
