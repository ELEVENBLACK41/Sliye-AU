/**
 * 本文件是 Next.js Agent Runtime 调用 NestJS 内部执行接口的唯一客户端。
 * 内部接口可以领取 Run、写事件、执行工具和收敛终态，因此只能由服务端携带
 * 共享密钥调用；浏览器既不持有该密钥，也不允许经 BFF 转发到这些路径。
 */
import 'server-only';

import type { AiLanguageModelRole } from '@workspace/contracts/ai';
import type { ApiErrorCode } from '@workspace/contracts/common';

import { requestNest } from '@/services/bff-request';

/** 内部执行接口在 NestJS 中的统一路径前缀。 */
const AI_RUNTIME_PATH_PREFIX = '/internal/ai/runs';

/** 携带共享密钥的请求头名称，必须与 NestJS 守卫保持一致。 */
const AI_RUNTIME_TOKEN_HEADER = 'x-ai-runtime-token';

/** 一条可注入模型上下文的历史消息。 */
export type AiRuntimeContextMessage = {
  /** 消息发送方角色。 */
  role: 'USER' | 'ASSISTANT';
  /** 已由服务端按预算截断的消息正文。 */
  content: string;
};

/** 工具描述中的一个具名字段。 */
export type AiRuntimeToolField = {
  /** 字段名。 */
  name: string;
  /** 字段基础值类型。 */
  valueType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'STRING_ARRAY' | 'OBJECT';
  /** 是否必填。 */
  required: boolean;
  /** 字段说明，会作为模型可见的参数描述。 */
  description: string;
};

/** 一项由 NestJS 中心注册表批准的只读工具描述。 */
export type AiRuntimeToolDescriptor = {
  /** 稳定工具名称。 */
  name: string;
  /** 工具用途与边界说明。 */
  description: string;
  /** 第二阶段只提供只读工具。 */
  accessMode: 'READ';
  /** 单次调用超时上限。 */
  timeoutMs: number;
  /** 工具窄输入契约。 */
  input: { description: string; fields: AiRuntimeToolField[] };
  /** 工具窄输出契约。 */
  output: { description: string; fields: AiRuntimeToolField[] };
};

/** Runtime 成功领取 Run 后取得的完整会话数据。 */
export type AiRuntimeSession = {
  /** 从持久化 Run 重新读取的受控执行上下文。 */
  execution: {
    /** 本次领取的 Run 标识。 */
    runId: string;
    /** Run 所属 Thread 标识。 */
    threadId: string;
    /** Thread 所有者，也是工具实时鉴权使用的用户标识。 */
    ownerUserId: number;
    /** 本次 Run 对应的原始用户消息标识。 */
    userMessageId: string;
    /** 本次 Run 对应的原始用户消息正文。 */
    userMessageContent: string;
    /** 本次 Run 使用的逻辑模型角色。 */
    modelRole: AiLanguageModelRole;
    /** 当前执行器持有的租约标识。 */
    executionLeaseId: string;
    /** 当前租约过期时间的 ISO 字符串。 */
    executionLeaseExpiresAt: string;
  };
  /** 受基础预算限制的最近历史消息，按时间正序。 */
  recentMessages: AiRuntimeContextMessage[];
  /** 当前允许模型使用的只读工具目录。 */
  tools: AiRuntimeToolDescriptor[];
};

/** 一次工具调用的编排结果；失败同样是正常返回，由模型决定下一步。 */
export type AiRuntimeToolInvocationResult =
  | { status: 'SUCCEEDED'; toolCallId: string; output: unknown }
  | {
      status: 'FAILED';
      toolCallId: string;
      failureCode: ApiErrorCode;
      failureReason: string;
    };

/** Run 收敛终态后的结果，可能同时领取到下一条排队消息对应的 Run。 */
export type AiRuntimeRunStopResult = {
  /** 被收敛的 Run 标识。 */
  runId: string;
  /** 事务完成后的最新状态。 */
  status: string;
  /** 终态后由队列领取的下一个 Run；没有则为 null。 */
  nextRunId: string | null;
};

/** NestJS 内部执行接口返回业务失败时抛出的错误。 */
export class AiRuntimeRequestError extends Error {
  /** 稳定业务错误码，Runtime 据此判断租约是否已失效。 */
  readonly code: string;

  /** 上游 HTTP 状态码。 */
  readonly status: number;

  /** 使用统一错误响应构造可判断的运行时错误。 */
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AiRuntimeRequestError';
    this.code = code;
    this.status = status;
  }
}

/** 判断错误是否代表当前执行租约已经失效（用户停止、被替代或对账收敛）。 */
export function isAiExecutionLeaseInvalid(error: unknown): boolean {
  return (
    error instanceof AiRuntimeRequestError &&
    (error.code === 'AI.EXECUTION_LEASE_INVALID' ||
      error.code === 'AI.EXECUTION_LEASE_EXPIRED')
  );
}

/** 原子领取一个排队 Run；已被其他执行器领取或已失效时返回 null。 */
export async function claimAiRuntimeSession(runId: string): Promise<AiRuntimeSession | null> {
  return callRuntime<AiRuntimeSession | null>(`/${runId}/claim`, {});
}

/** 延长当前执行器租约，返回新的过期时间。 */
export async function renewAiRuntimeLease(
  runId: string,
  executionLeaseId: string,
): Promise<Date> {
  const result = await callRuntime<{ executionLeaseExpiresAt: string }>(`/${runId}/lease/renew`, {
    executionLeaseId,
  });

  return new Date(result.executionLeaseExpiresAt);
}

/** 确保当前 Run 已有助手消息占位，供文本增量事件引用稳定标识。 */
export async function ensureAiAssistantMessage(
  runId: string,
  executionLeaseId: string,
): Promise<string> {
  const result = await callRuntime<{ messageId: string }>(`/${runId}/assistant-message`, {
    executionLeaseId,
  });

  return result.messageId;
}

/** 追加一条助手文本增量事件。 */
export async function appendAiAssistantTextDelta(input: {
  runId: string;
  executionLeaseId: string;
  messageId: string;
  delta: string;
}): Promise<void> {
  await callRuntime<{ sequence: number }>(`/${input.runId}/events/assistant-text`, {
    executionLeaseId: input.executionLeaseId,
    messageId: input.messageId,
    delta: input.delta,
  });
}

/** 记录一次模型步骤的受控元数据与 Token 摘要。 */
export async function recordAiRuntimeStep(input: {
  runId: string;
  executionLeaseId: string;
  sequence: number;
  resolvedModelId?: string;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  startedAt: string;
  finishedAt: string;
}): Promise<void> {
  const { runId, ...body } = input;
  await callRuntime<{ stepId: string; sequence: number }>(`/${runId}/steps`, body);
}

/** 请求 NestJS 执行一次只读工具调用；权限与串联规则都在服务端强制。 */
export async function invokeAiRuntimeTool(input: {
  runId: string;
  executionLeaseId: string;
  providerToolCallId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
}): Promise<AiRuntimeToolInvocationResult> {
  return callRuntime<AiRuntimeToolInvocationResult>(`/${input.runId}/tool-calls`, {
    executionLeaseId: input.executionLeaseId,
    providerToolCallId: input.providerToolCallId,
    toolName: input.toolName,
    input: input.toolInput,
  });
}

/** 把 Run 收敛为完成或失败终态，并写入助手最终正文与用量。 */
export async function completeAiRuntimeRun(input: {
  runId: string;
  executionLeaseId: string;
  status: 'COMPLETED' | 'FAILED';
  failureReason?: string;
  failureCode?: string;
  assistantMessageContent?: string;
  resolvedModelId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd?: number;
  };
}): Promise<AiRuntimeRunStopResult> {
  const { runId, ...body } = input;

  return callRuntime<AiRuntimeRunStopResult>(`/${runId}/complete`, body);
}

/** 执行器已停止写入后确认取消，把取消请求唯一收敛为 CANCELLED。 */
export async function confirmAiRuntimeCancellation(
  runId: string,
): Promise<AiRuntimeRunStopResult> {
  return callRuntime<AiRuntimeRunStopResult>(`/${runId}/cancel-confirm`, {});
}

/** 统一发起内部执行请求，并把统一失败响应转换为可判断的运行时错误。 */
async function callRuntime<TData>(path: string, body: unknown): Promise<TData> {
  const response = await requestNest<TData>(`${AI_RUNTIME_PATH_PREFIX}${path}`, {
    method: 'POST',
    headers: { [AI_RUNTIME_TOKEN_HEADER]: readRuntimeServiceToken() },
    body,
  });

  if (!response.body.success) {
    throw new AiRuntimeRequestError(response.body.code, response.body.message, response.status);
  }

  return response.body.data;
}

/** 读取只有服务端持有的共享密钥；未配置时立即失败，不降级为无鉴权调用。 */
function readRuntimeServiceToken(): string {
  const token = process.env.AI_RUNTIME_SERVICE_TOKEN;

  if (!token) {
    throw new AiRuntimeRequestError(
      'AI.RUNTIME_SERVICE_UNAUTHORIZED',
      '未配置 AI_RUNTIME_SERVICE_TOKEN，AI 执行器无法调用内部接口',
      500,
    );
  }

  return token;
}
