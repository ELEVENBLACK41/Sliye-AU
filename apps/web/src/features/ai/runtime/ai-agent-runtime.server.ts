/**
 * 本文件协调单实例 BFF 的 Run 领取、Agent Loop、租约续租、持久化和终态收敛。
 */
import 'server-only';

import type { UIMessage } from 'ai';
import type {
  AiDecisionContext,
  AiRunCreation,
  AiRunFailureReason,
  GetDecisionContextToolResultSummary,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES, type ApiErrorCode } from '@workspace/contracts/common';

import { createDecisionHubAgent } from '../agents/decision-hub-agent';
import { routeDecisionAgentRequest } from '../agents/decision-agent-scope-policy';
import { buildAiAgentContext } from '../context/agent-context-builder.server';
import { normalizeAiModelError } from './ai-model-error';
import { estimateAiLanguageModelCostUsd } from './ai-model-registry';
import { resolveAiLanguageModel } from './ai-model.server';
import {
  AiNestRequestError,
  appendAiTextDelta,
  claimAiRun,
  completeAiRun,
  confirmAiRunCancellation,
  failAiRun,
  finishAiToolCall,
  recordAiModelStep,
  renewAiRun,
  startAiToolCall,
  type AiNestIdentity,
} from './ai-nest-client.server';
import {
  createAiExecutionStreamResponse,
  createAiRecoveryStreamResponse,
  type DecisionAgentStreamPart,
} from './ai-stream.server';

/** execution lease 的第一版有效时长。 */
const AI_EXECUTION_LEASE_DURATION_MS = 60_000;
/** 执行器续租间隔，始终小于租约有效时长。 */
const AI_EXECUTION_LEASE_RENEW_INTERVAL_MS = 20_000;

/** 单实例进程中一条正在执行 Run 的临时句柄。 */
type AiExecutorHandle = {
  /** 传播到 Agent、模型和工具的本地取消控制器。 */
  abortController: AbortController;
  /** 显式 stop 请求是否已经先写入 NestJS 状态。 */
  cancellationRequested: boolean;
};

/** 进程内临时执行器注册表；PostgreSQL 仍是唯一权威状态。 */
const aiExecutors = new Map<string, AiExecutorHandle>();

/** 原子领取并启动一条新 Run，幂等重放则只恢复持久化事件。 */
export async function startAiRunExecution(options: {
  identity: AiNestIdentity;
  creation: AiRunCreation;
  uiMessages: UIMessage[];
}): Promise<Response> {
  const { creation, identity } = options;

  if (creation.replayed || aiExecutors.has(creation.run.id)) {
    return createAiRecoveryStreamResponse({
      identity,
      threadId: creation.thread.id,
      runId: creation.run.id,
      afterSequence: 0,
    });
  }

  const lease = await claimAiRun(identity, creation.run.id, {
    leaseDurationMs: AI_EXECUTION_LEASE_DURATION_MS,
  });
  const handle: AiExecutorHandle = {
    abortController: new AbortController(),
    cancellationRequested: false,
  };
  aiExecutors.set(creation.run.id, handle);

  return createClaimedRunResponse({
    identity,
    creation,
    executionLeaseId: lease.executionLeaseId,
    handle,
    uiMessages: options.uiMessages,
  });
}

/** 在 stop 已落库后触发当前进程内执行器 Abort。 */
export function abortAiRunExecutor(runId: string): boolean {
  const executor = aiExecutors.get(runId);

  if (!executor) {
    return false;
  }

  executor.cancellationRequested = true;
  executor.abortController.abort('USER_REQUESTED');
  return true;
}

/** 返回当前进程是否已经注册指定 Run，供确定性测试和诊断使用。 */
export function hasAiRunExecutor(runId: string): boolean {
  return aiExecutors.has(runId);
}

/** 为已经领取租约的 Run 创建持久化优先的真实模型流。 */
async function createClaimedRunResponse(options: {
  identity: AiNestIdentity;
  creation: AiRunCreation;
  executionLeaseId: string;
  handle: AiExecutorHandle;
  uiMessages: UIMessage[];
}): Promise<Response> {
  const { creation, executionLeaseId, handle, identity } = options;
  const assistantMessageId = crypto.randomUUID();
  const stepStartTimes = new Map<number, Date>();
  const toolSequences = new Map<string, number>();
  let nextToolSequence = 1;
  let assistantContent = '';
  let resolvedModelId = creation.run.resolvedModelId ?? '';
  let fatalError: unknown = null;
  let fatalFailureReason: AiRunFailureReason = 'MODEL_ERROR';
  let fatalErrorEmitted = false;
  let finalized = false;
  let renewalInFlight = false;

  /** 记录首个不可恢复错误并终止模型、工具和后续流式写入。 */
  const stopForFatalError = (error: unknown, failureReason: AiRunFailureReason, abortReason: string): void => {
    if (!fatalError) {
      fatalError = error;
      fatalFailureReason = failureReason;
    }

    if (!handle.abortController.signal.aborted) {
      handle.abortController.abort(abortReason);
    }
  };

  const leaseTimer = setInterval(() => {
    if (renewalInFlight || finalized) {
      return;
    }

    renewalInFlight = true;
    void renewAiRun(identity, creation.run.id, {
      executionLeaseId,
      leaseDurationMs: AI_EXECUTION_LEASE_DURATION_MS,
    })
      .catch((error: unknown) => {
        stopForFatalError(error, 'EXECUTION_LEASE_EXPIRED', 'EXECUTION_LEASE_EXPIRED');
      })
      .finally(() => {
        renewalInFlight = false;
      });
  }, AI_EXECUTION_LEASE_RENEW_INTERVAL_MS);

  /** 只执行一次的终态写入与临时句柄清理。 */
  const finalize = async (): Promise<void> => {
    if (finalized) {
      return;
    }
    finalized = true;
    clearInterval(leaseTimer);

    try {
      if (handle.cancellationRequested) {
        await confirmAiRunCancellation(identity, creation.run.id, { executionLeaseId });
      } else if (fatalError || !assistantContent.trim()) {
        const failure = resolveExecutionFailure(fatalError, fatalFailureReason, assistantContent);
        await failAiRun(identity, creation.run.id, {
          executionLeaseId,
          failureReason: failure.reason,
          failureCode: failure.code,
        });
      } else {
        await completeAiRun(identity, creation.run.id, {
          executionLeaseId,
          assistantMessageId,
          assistantContent,
          resolvedModelId,
        });
      }
    } catch (error) {
      if (
        !(error instanceof AiNestRequestError && error.response.code === API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID)
      ) {
        console.error('[AI_RUN_FINALIZE_FAILED]', {
          runId: creation.run.id,
          errorCode: error instanceof AiNestRequestError ? error.response.code : API_ERROR_CODES.COMMON_INTERNAL_ERROR,
        });
      }
    } finally {
      if (aiExecutors.get(creation.run.id) === handle) {
        aiExecutors.delete(creation.run.id);
      }
    }
  };

  try {
    const resolvedModel = resolveAiLanguageModel(creation.run.modelRole, {
      userId: identity.userId,
      feature: 'decision-agent',
    });
    const context = buildAiAgentContext(options.uiMessages);
    const scopeRoute = routeDecisionAgentRequest(creation.message.content);
    const agent = createDecisionHubAgent(
      resolvedModel,
      {
        userId: identity.userId,
        accessToken: identity.accessToken,
        runId: creation.run.id,
        executionLeaseId,
        decisionId: creation.thread.decisionId,
      },
      scopeRoute,
    );
    resolvedModelId = resolvedModel.configuration.primary.modelId;
    const result = await agent.stream({
      messages: context.messages,
      abortSignal: handle.abortController.signal,
      onStepStart: ({ stepNumber }) => {
        stepStartTimes.set(stepNumber, new Date());
      },
      onStepEnd: async (step) => {
        const finishedAt = new Date();
        const startedAt =
          stepStartTimes.get(step.stepNumber) ?? new Date(finishedAt.getTime() - step.performance.stepTimeMs);
        resolvedModelId = step.model.modelId;
        try {
          await recordAiModelStep(identity, creation.run.id, {
            executionLeaseId,
            sequence: step.stepNumber + 1,
            modelRole: creation.run.modelRole,
            resolvedModelId: step.model.modelId,
            provider: step.model.provider,
            responseId: step.response.id ?? null,
            finishReason: step.finishReason,
            inputTokens: step.usage.inputTokens ?? 0,
            outputTokens: step.usage.outputTokens ?? 0,
            estimatedCostUsd: estimateAiLanguageModelCostUsd(step.model.modelId, step.usage) ?? 0,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            timeToFirstOutputMs:
              step.performance.timeToFirstOutputMs === undefined
                ? null
                : Math.max(0, Math.round(step.performance.timeToFirstOutputMs)),
          });
        } catch (error) {
          stopForFatalError(error, 'INTERNAL_ERROR', 'STEP_PERSISTENCE_FAILED');
        }
      },
      onToolExecutionStart: async ({ toolCall }) => {
        const sequence = nextToolSequence++;
        try {
          await startAiToolCall(identity, creation.run.id, {
            executionLeaseId,
            toolCallId: toolCall.toolCallId,
            sequence,
            toolName: 'getDecisionContext',
            input: { decisionId: creation.thread.decisionId },
          });
          toolSequences.set(toolCall.toolCallId, sequence);
        } catch (error) {
          stopForFatalError(error, 'INTERNAL_ERROR', 'TOOL_AUDIT_START_FAILED');
        }
      },
      onToolExecutionEnd: async ({ toolCall, toolExecutionMs, toolOutput }) => {
        if (!toolSequences.has(toolCall.toolCallId)) {
          return;
        }

        try {
          if (toolOutput.type === 'tool-result') {
            await finishAiToolCall(identity, creation.run.id, {
              executionLeaseId,
              toolCallId: toolCall.toolCallId,
              resultSummary: summarizeDecisionContext(asDecisionContext(toolOutput.output)),
              errorCode: null,
              durationMs: Math.max(0, Math.round(toolExecutionMs)),
            });
            return;
          }

          await finishAiToolCall(identity, creation.run.id, {
            executionLeaseId,
            toolCallId: toolCall.toolCallId,
            resultSummary: null,
            errorCode: resolveToolErrorCode(toolOutput.error),
            durationMs: Math.max(0, Math.round(toolExecutionMs)),
          });
          stopForFatalError(
            toolOutput.error ?? new Error('getDecisionContext 执行失败'),
            'TOOL_ERROR',
            'TOOL_EXECUTION_FAILED',
          );
        } catch (error) {
          stopForFatalError(error, 'INTERNAL_ERROR', 'TOOL_AUDIT_FINISH_FAILED');
        }
      },
    });

    const persistedStream = result.stream.pipeThrough(
      new TransformStream<DecisionAgentStreamPart, DecisionAgentStreamPart>({
        async transform(part, controller) {
          if (fatalError) {
            if (!fatalErrorEmitted) {
              fatalErrorEmitted = true;
              controller.enqueue({ type: 'error', error: fatalError });
            }
            return;
          }

          if (part.type === 'text-delta' && part.text) {
            try {
              await appendAiTextDelta(identity, creation.run.id, {
                executionLeaseId,
                messageId: assistantMessageId,
                delta: part.text,
              });
              assistantContent += part.text;
            } catch (error) {
              fatalError = error;
              fatalFailureReason = 'INTERNAL_ERROR';
              handle.abortController.abort('PERSISTENCE_FAILED');
              controller.enqueue({ type: 'error', error });
              return;
            }
          } else if (part.type === 'error') {
            fatalError = part.error;
            fatalFailureReason = 'MODEL_ERROR';
          }

          controller.enqueue(part);
        },
        async flush() {
          await finalize();
        },
      }),
    );

    return createAiExecutionStreamResponse({
      metadata: {
        threadId: creation.thread.id,
        messageId: creation.message.id,
        runId: creation.run.id,
        replayed: creation.replayed,
      },
      stream: persistedStream,
      onBackgroundStreamEnd: finalize,
      onError: (error) => resolveExecutionStreamError(error, fatalFailureReason),
    });
  } catch (error) {
    fatalError = error;
    fatalFailureReason = 'MODEL_ERROR';
    await finalize();
    throw error;
  }
}

/** 从完整工具输出提取允许长期审计的受控摘要。 */
function summarizeDecisionContext(context: AiDecisionContext): GetDecisionContextToolResultSummary {
  return {
    decisionId: context.decision.id,
    decisionTitle: context.decision.title,
    decisionStatus: context.decision.status,
    projectTitle: context.project.title,
    areaName: context.area?.name ?? null,
    participantCount: context.decision.participantCount,
    sourceIds: context.sources.map((source) => source.sourceId),
  };
}

/** 防御性确认工具输出包含决策、项目和来源后再进入审计摘要。 */
function asDecisionContext(value: unknown): AiDecisionContext {
  if (!value || typeof value !== 'object' || !('decision' in value) || !('project' in value) || !('sources' in value)) {
    throw new Error('getDecisionContext 返回结构不完整');
  }

  return value as AiDecisionContext;
}

/** 把工具执行错误收敛为不包含内部堆栈和凭据的稳定错误码。 */
function resolveToolErrorCode(error: unknown): string {
  return error instanceof AiNestRequestError ? error.response.code : API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED;
}

/** 根据执行阶段和规范化模型错误决定 Run 失败终态。 */
function resolveExecutionFailure(
  error: unknown,
  reason: AiRunFailureReason,
  assistantContent: string,
): { reason: AiRunFailureReason; code: ApiErrorCode } {
  if (!error && !assistantContent.trim()) {
    return {
      reason: 'MODEL_ERROR',
      code: API_ERROR_CODES.AI_MODEL_RESPONSE_INVALID,
    };
  }

  if (error instanceof AiNestRequestError) {
    return { reason, code: error.response.code };
  }

  if (reason === 'TOOL_ERROR') {
    return { reason, code: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED };
  }

  return { reason, code: normalizeAiModelError(error).code };
}

/** 为 UI 返回与失败阶段一致的脱敏错误，不把业务工具失败伪装成模型故障。 */
function resolveExecutionStreamError(error: unknown, reason: AiRunFailureReason): string {
  if (error instanceof AiNestRequestError) {
    return error.response.message;
  }

  if (reason === 'TOOL_ERROR') {
    return '读取决策上下文失败，请稍后重试';
  }

  if (reason === 'INTERNAL_ERROR') {
    return 'AI 运行状态保存失败，请重新尝试';
  }

  return normalizeAiModelError(error).message;
}
