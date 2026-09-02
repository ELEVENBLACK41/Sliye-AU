/**
 * 本文件编排 C2 临时 Workspace Agent Spike 的历史读取、Run 领取和官方流响应。
 * 它复用已有 Thread/Run 数据模型；C2 不写入新的 UIMessage 持久化格式，也不承担主链职责。
 */

import {
  createAgentUIStreamResponse,
  validateUIMessages,
} from 'ai';
import type {
  AiMessageHistoryItem,
  AiMessagePage,
  AiRuntimeSession,
  AiThreadDetail,
  AiThreadMessageSubmissionResult,
} from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { ApiErrorCode } from '@workspace/contracts/common';

import { apiError } from '@/app/api/_utils/response';
import type { NextNestWorkspaceAgentUIMessage } from '@/features/ai/agents/nextnest-workspace-agent.server';
import { createNextNestWorkspaceAgent } from '@/features/ai/agents/nextnest-workspace-agent.server';
import { normalizeAiModelError } from '@/features/ai/runtime/ai-model-error';
import {
  claimAiRuntimeSession,
  completeAiRuntimeRun,
} from '@/features/ai/runtime/ai-runtime-client.server';
import { requestNest, type NestResponse } from '@/services/bff-request';

/** C2 Spike 接收的已通过 Route 基础校验的请求数据。 */
export type AiAgentSpikeInput = {
  /** 当前认证用户的内部主键。 */
  userId: number;
  /** 当前请求的内部关联标识。 */
  requestId: string;
  /** 当前用户的访问令牌，只在服务端转发给 NestJS。 */
  accessToken: string;
  /** 目标 Thread 标识。 */
  threadId: string;
  /** 最后一条用户 UIMessage。 */
  message: {
    /** AI SDK 消息标识，同时作为现有消息接口的幂等键。 */
    id: string;
    /** 当前 C2 只接受用户消息。 */
    role: 'user';
    /** UI Message parts，进入官方校验前保持原始结构。 */
    parts: unknown[];
  };
  /** 从最后一条用户 UIMessage 提取出的纯文本。 */
  messageText: string;
};

/** 流式执行期间需要交给 UI Message Stream 的脱敏失败信息。 */
type AiAgentSpikeFailure = {
  /** 稳定的共享错误码。 */
  code: ApiErrorCode;
  /** 可以安全交给客户端的中文说明。 */
  message: string;
};

/** 读取受保护 Thread 历史、领取 Run 并启动官方 Agent UI Message Stream。 */
export async function startAiAgentSpike(input: AiAgentSpikeInput) {
  const path = '/api/ai/spike';
  const nestHeaders = { Authorization: 'Bearer ' + input.accessToken };
  const threadPath = '/ai/threads/' + encodeURIComponent(input.threadId);
  const threadResponse = await requestNest<AiThreadDetail>(threadPath, {
    headers: nestHeaders,
  });

  if (!threadResponse.body.success) {
    return createAgentSpikeUpstreamError(
      threadResponse,
      path,
      'AI 会话详情加载失败，请稍后重试',
      input.requestId,
    );
  }

  if (threadResponse.body.data.activeRun) {
    return apiError({
      status: 409,
      code: API_ERROR_CODES.AI_THREAD_RUN_ACTIVE,
      message: '当前会话已有运行中的回答，请稍后再试',
      path,
      requestId: input.requestId,
    });
  }

  const historyResponse = await requestNest<AiMessagePage>(
    threadPath + '/messages?limit=100',
    { headers: nestHeaders },
  );

  if (!historyResponse.body.success) {
    return createAgentSpikeUpstreamError(
      historyResponse,
      path,
      'AI 会话历史加载失败，请稍后重试',
      input.requestId,
    );
  }

  const persistedMessages = historyResponse.body.data.items.map(toUiMessage);
  const submissionResponse = await requestNest<AiThreadMessageSubmissionResult>(
    threadPath + '/messages',
    {
      method: 'POST',
      headers: nestHeaders,
      body: {
        message: input.messageText,
        idempotencyKey: input.message.id,
        submissionMode: 'NORMAL' as const,
      },
    },
  );

  if (!submissionResponse.body.success) {
    return createAgentSpikeUpstreamError(
      submissionResponse,
      path,
      'AI Spike 消息提交失败，请稍后重试',
      input.requestId,
    );
  }

  const runId = submissionResponse.body.data.runId;

  if (!runId) {
    return apiError({
      status: 409,
      code: API_ERROR_CODES.AI_THREAD_RUN_ACTIVE,
      message: 'AI Spike 未能取得可执行的 Run，请确认会话当前空闲',
      path,
      requestId: input.requestId,
    });
  }

  let session: AiRuntimeSession | null;

  try {
    session = await claimAiRuntimeSession(runId);
  } catch (error) {
    return createAgentSpikeRuntimeError(error, path, input.requestId);
  }

  if (!session) {
    return apiError({
      status: 409,
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      message: 'AI Spike Run 已被其他执行器领取，请稍后重试',
      path,
      requestId: input.requestId,
    });
  }

  let agent: ReturnType<typeof createNextNestWorkspaceAgent>;

  try {
    agent = createNextNestWorkspaceAgent({
      requestId: input.requestId,
      userId: session.execution.ownerUserId,
      runId: session.execution.runId,
      executionLeaseId: session.execution.executionLeaseId,
      modelRole: session.execution.modelRole,
    });
  } catch (error) {
    const normalized = normalizeAiModelError(error);
    await settleAiAgentSpikeRun({
      runId: session.execution.runId,
      executionLeaseId: session.execution.executionLeaseId,
      failure: { code: normalized.code, message: normalized.message },
    });

    return createAgentSpikeRuntimeError(error, path, input.requestId);
  }

  const uiMessages = [...persistedMessages, input.message];
  let validatedMessages: NextNestWorkspaceAgentUIMessage[];

  try {
    validatedMessages = await validateUIMessages<NextNestWorkspaceAgentUIMessage>({
      messages: uiMessages,
      tools: agent.tools,
    });
  } catch {
    await settleAiAgentSpikeRun({
      runId: session.execution.runId,
      executionLeaseId: session.execution.executionLeaseId,
      failure: {
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: 'AI 消息格式校验失败',
      },
    });

    return apiError({
      status: 400,
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message: 'AI 消息格式校验失败',
      path,
      requestId: input.requestId,
    });
  }

  let streamFailure: AiAgentSpikeFailure | null = null;
  let resolvedModelId: string | undefined;

  try {
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: validatedMessages,
      headers: { 'X-NextNest-AI-Spike': 'c2' },
      onStepEnd: ({ model }) => {
        resolvedModelId = model.modelId;
      },
      onError: (error) => {
        const normalized = normalizeAiModelError(error);
        streamFailure = {
          code: normalized.code,
          message: normalized.message,
        };

        return normalized.message;
      },
      onEnd: async ({ responseMessage, isAborted }) => {
        await settleAiAgentSpikeRun({
          runId: session.execution.runId,
          executionLeaseId: session.execution.executionLeaseId,
          assistantMessageContent: extractUiMessageText(responseMessage),
          resolvedModelId,
          failure:
            streamFailure ??
            (isAborted
              ? {
                  code: API_ERROR_CODES.AI_MODEL_CANCELLED,
                  message: 'AI 请求已取消',
                }
              : null),
        });
      },
      // 继续消费服务端副本，使客户端断开不会让官方流失去唯一消费者；不承诺进程重启后的耐久恢复。
      consumeSseStream: (stream) => consumeAiAgentSpikeSseStream(stream, runId),
    });
  } catch (error) {
    const normalized = normalizeAiModelError(error);
    await settleAiAgentSpikeRun({
      runId: session.execution.runId,
      executionLeaseId: session.execution.executionLeaseId,
      failure: { code: normalized.code, message: normalized.message },
    });

    return createAgentSpikeRuntimeError(error, path, input.requestId);
  }
}

/** 把现有历史接口的文本投影转换为 AI SDK 可验证的 UIMessage。 */
function toUiMessage(item: AiMessageHistoryItem): NextNestWorkspaceAgentUIMessage {
  return {
    id: item.id,
    role: item.role === 'USER' ? 'user' : 'assistant',
    parts: item.content ? [{ type: 'text', text: item.content }] : [],
  };
}

/** 从 AI SDK 响应消息中提取最终文本，用于复用既有 Run 的纯文本投影。 */
function extractUiMessageText(message: NextNestWorkspaceAgentUIMessage): string {
  return message.parts
    .filter((part): part is Extract<NextNestWorkspaceAgentUIMessage['parts'][number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

/** 消费 UI Message Stream 的服务端副本，并吞掉断开后的消费异常避免形成未处理 Promise。 */
async function consumeAiAgentSpikeSseStream({ stream }: { stream: ReadableStream<string> }, runId: string): Promise<void> {
  try {
    await stream.pipeTo(new WritableStream<string>({ write() {} }));
  } catch (error) {
    console.error('[ai-agent-spike] UI Message Stream 消费失败', { runId, error });
  }
}

/** 在官方流结束后把结果写回已有 Run；写回失败只记录服务端日志，不污染已发送的 UI 流。 */
async function settleAiAgentSpikeRun(input: {
  runId: string;
  executionLeaseId: string;
  assistantMessageContent?: string;
  resolvedModelId?: string;
  failure: AiAgentSpikeFailure | null;
}): Promise<void> {
  try {
    await completeAiRuntimeRun({
      runId: input.runId,
      executionLeaseId: input.executionLeaseId,
      status: input.failure ? 'FAILED' : 'COMPLETED',
      ...(input.failure
        ? {
            failureCode: input.failure.code,
            failureReason: input.failure.message,
          }
        : {}),
      assistantMessageContent: input.assistantMessageContent || undefined,
      resolvedModelId: input.resolvedModelId,
    });
  } catch (error) {
    console.error('[ai-agent-spike] Run 终态写入失败', {
      runId: input.runId,
      error,
    });
  }
}

/** 把 NestJS 统一失败响应转换为 C2 Route 的脱敏错误。 */
function createAgentSpikeUpstreamError<TData>(
  response: NestResponse<TData>,
  path: string,
  fallbackMessage: string,
  requestId: string,
) {
  const status = response.status >= 400 && response.status <= 599 ? response.status : 502;

  if (!response.body.success) {
    return apiError({
      status,
      code: response.body.code,
      message: response.body.message || fallbackMessage,
      path,
      requestId,
    });
  }

  return apiError({ status, message: fallbackMessage, path, requestId });
}

/** 把 C2 内部 Runtime 或模型装配异常转换为脱敏的服务端错误。 */
function createAgentSpikeRuntimeError(error: unknown, path: string, requestId: string) {
  const normalized = normalizeAiModelError(error);

  return apiError({
    status: normalized.status,
    code: normalized.code,
    message: normalized.message,
    path,
    requestId,
  });
}
