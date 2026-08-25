/**
 * 本文件是运行在 Next.js 服务端的 Agent Runtime 模型循环。
 *
 * Runtime 只持有 runId 与执行租约：领取、上下文、工具目录、工具执行、事件、步骤
 * 和终态全部经 NestJS 内部执行接口完成，用户身份与业务权限由 NestJS 现取现算。
 * 浏览器断开不会取消运行；用户主动停止会使租约失效，Runtime 随即停止写入并确认取消。
 */
import 'server-only';

import { isStepCount, streamText, type ModelMessage } from 'ai';
import type { AiRuntimeSession } from '@workspace/contracts/ai';

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
} from './ai-runtime-client.server.ts';
import { runAiRunChain } from './ai-run-chain.ts';

/** 单轮运行允许的最大模型步骤数，避免工具循环无限进行。 */
const MAX_AGENT_STEPS = 6;

/** 续租间隔；必须明显小于服务端 30 秒租约时长。 */
const LEASE_RENEW_INTERVAL_MS = 10_000;

/** 文本增量累计到该长度就立即落库一次。 */
const TEXT_FLUSH_CHARACTERS = 120;

/** 距离上次落库超过该时间就强制落库一次，保证前端可以尽快看到进度。 */
const TEXT_FLUSH_INTERVAL_MS = 400;

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
export async function startAiAgentRun(runId: string): Promise<void> {
  try {
    await runAiAgentExecution(runId);
  } catch (error: unknown) {
    console.error('[ai-agent-runtime] 运行失败', { runId, error });
  }
}

/** 串行领取并执行当前 Run 及其终态事务释放出的后续排队 Run。 */
export async function runAiAgentExecution(runId: string): Promise<void> {
  await runAiRunChain(runId, claimAiRuntimeSession, executeClaimedSession);
}

/** 执行一次已领取的会话，并返回终态事务领取到的下一个 Run 标识。 */
async function executeClaimedSession(session: AiRuntimeSession): Promise<string | null> {
  const { execution } = session;
  const abortController = new AbortController();
  const pendingSteps: PendingAgentStep[] = [];
  /** 续租失败会先中止模型流，中止原因不再是原始租约错误，因此单独记录该事实。 */
  const leaseState = { invalidated: false };
  const leaseTimer = startLeaseRenewal(execution.runId, execution.executionLeaseId, abortController, leaseState);

  let assistantMessageId: string | null = null;
  let assistantText = '';
  let pendingDelta = '';
  let lastFlushedAt = Date.now();

  /** 把缓冲中的文本增量落库，并在首次落库前创建助手消息占位。 */
  const flushDelta = async (): Promise<void> => {
    if (pendingDelta.length === 0) {
      return;
    }

    assistantMessageId ??= await ensureAiAssistantMessage(execution.runId, execution.executionLeaseId);
    const delta = pendingDelta;
    pendingDelta = '';
    lastFlushedAt = Date.now();
    await appendAiAssistantTextDelta({
      runId: execution.runId,
      executionLeaseId: execution.executionLeaseId,
      messageId: assistantMessageId,
      delta,
    });
  };

  try {
    const resolvedModel = resolveAiLanguageModel(execution.modelRole, {
      userId: execution.ownerUserId,
      feature: 'decision-agent',
    });
    const { configuration } = resolvedModel;
    const stepStartedAt = { value: new Date() };
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
      tools: buildAiAgentTools(session.tools, {
        runId: execution.runId,
        executionLeaseId: execution.executionLeaseId,
      }),
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
      assistantText += delta;
      pendingDelta += delta;

      if (pendingDelta.length >= TEXT_FLUSH_CHARACTERS || Date.now() - lastFlushedAt >= TEXT_FLUSH_INTERVAL_MS) {
        await flushDelta();
      }
    }

    await flushDelta();
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

    return settled.nextRunId;
  } catch (error) {
    return await settleFailedRun(session, error, assistantText, pendingSteps, leaseState.invalidated);
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
): Promise<string | null> {
  const { execution } = session;

  if (leaseInvalidated || isAiExecutionLeaseInvalid(error)) {
    return safeConfirmCancellation(execution.runId);
  }

  const normalized = normalizeAiModelError(error);
  logAiModelStreamError(execution.runId, execution.modelRole, error);

  try {
    await flushSteps(execution.runId, execution.executionLeaseId, pendingSteps);
    const settled = await completeAiRuntimeRun({
      runId: execution.runId,
      executionLeaseId: execution.executionLeaseId,
      status: 'FAILED',
      failureReason: 'MODEL_ERROR',
      failureCode: normalized.code,
      assistantMessageContent: assistantText.length > 0 ? assistantText : undefined,
    });

    return settled.nextRunId;
  } catch (settleError: unknown) {
    if (isAiExecutionLeaseInvalid(settleError)) {
      return safeConfirmCancellation(execution.runId);
    }

    console.error('[ai-agent-runtime] 写入失败终态时出错', {
      runId: execution.runId,
      error: settleError,
    });

    return null;
  }
}

/** 确认取消；确认本身失败时交由服务端过期租约对账收敛，不阻塞当前进程。 */
async function safeConfirmCancellation(runId: string): Promise<string | null> {
  try {
    const settled = await confirmAiRuntimeCancellation(runId);

    return settled.nextRunId;
  } catch (error: unknown) {
    console.error('[ai-agent-runtime] 确认取消失败', { runId, error });

    return null;
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
