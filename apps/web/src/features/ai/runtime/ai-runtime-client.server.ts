/**
 * 本文件是 Next.js Agent Runtime 调用 NestJS 内部执行接口的唯一客户端。
 * 内部接口可以领取 Run、写事件、执行工具和收敛终态，因此只能由服务端携带
 * 共享密钥调用；浏览器既不持有该密钥，也不允许经 BFF 转发到这些路径。
 */
import 'server-only';

import type {
  AiEvent,
  AiRuntimeProviderWebSearchResult,
  AiRuntimeProviderWebSearchSettleInput,
  AiRuntimeProviderWebSearchStartInput,
  AiRuntimeReconciliationResult,
  AiRuntimeRunStopResult,
  AiRuntimeSession,
  AiRuntimeToolInvocationResult,
} from '@workspace/contracts/ai';

import { requestNest } from '../../../services/bff-request.ts';

/** 内部执行接口在 NestJS 中的统一路径前缀。 */
const AI_RUNTIME_PATH_PREFIX = '/internal/ai/runs';

/** 携带共享密钥的请求头名称，必须与 NestJS 守卫保持一致。 */
const AI_RUNTIME_TOKEN_HEADER = 'x-ai-runtime-token';

/** 共享密钥的最小长度，必须与 NestJS 侧的生产校验保持一致。 */
const AI_RUNTIME_SERVICE_TOKEN_MIN_LENGTH = 32;

/** 判断当前进程是否具备调用内部执行接口的条件，供后台协调能力提前退出。 */
export function hasAiRuntimeServiceToken(): boolean {
  const token = process.env.AI_RUNTIME_SERVICE_TOKEN;

  return typeof token === 'string' && token.length >= AI_RUNTIME_SERVICE_TOKEN_MIN_LENGTH;
}

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
    (error.code === 'AI.EXECUTION_LEASE_INVALID' || error.code === 'AI.EXECUTION_LEASE_EXPIRED')
  );
}

/** 原子领取一个排队 Run；已被其他执行器领取或已失效时返回 null。 */
export async function claimAiRuntimeSession(runId: string): Promise<AiRuntimeSession | null> {
  return callRuntime<AiRuntimeSession | null>(`/${runId}/claim`, {});
}

/** 延长当前执行器租约，返回新的过期时间。 */
export async function renewAiRuntimeLease(runId: string, executionLeaseId: string): Promise<Date> {
  const result = await callRuntime<{ executionLeaseExpiresAt: string }>(`/${runId}/lease/renew`, {
    executionLeaseId,
  });

  return new Date(result.executionLeaseExpiresAt);
}

/** 确保当前 Run 已有助手消息占位，供文本增量事件引用稳定标识。 */
export async function ensureAiAssistantMessage(runId: string, executionLeaseId: string): Promise<string> {
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
  liveDeltaIds?: readonly string[];
  liveSequenceStart?: number;
  liveSequenceEnd?: number;
}): Promise<AiEvent> {
  return callRuntime<AiEvent>(`/${input.runId}/events/assistant-text`, {
    executionLeaseId: input.executionLeaseId,
    messageId: input.messageId,
    delta: input.delta,
    liveDeltaIds: input.liveDeltaIds,
    liveSequenceStart: input.liveSequenceStart,
    liveSequenceEnd: input.liveSequenceEnd,
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
  providerToolCallIds: string[];
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
  signal?: AbortSignal;
}): Promise<AiRuntimeToolInvocationResult> {
  return callRuntime<AiRuntimeToolInvocationResult>(
    `/${input.runId}/tool-calls`,
    {
      executionLeaseId: input.executionLeaseId,
      providerToolCallId: input.providerToolCallId,
      toolName: input.toolName,
      input: input.toolInput,
    },
    { signal: input.signal },
  );
}

/** 登记一次由 AI Gateway 执行的网页检索开始事件。 */
export async function startAiProviderWebSearch(
  runId: string,
  input: AiRuntimeProviderWebSearchStartInput,
  signal?: AbortSignal,
): Promise<AiRuntimeProviderWebSearchResult> {
  return callRuntime<AiRuntimeProviderWebSearchResult>(`/${runId}/provider-tools/web-search/start`, input, { signal });
}

/** 持久化 AI Gateway 网页检索来源并结束对应工具调用。 */
export async function settleAiProviderWebSearch(
  runId: string,
  input: AiRuntimeProviderWebSearchSettleInput,
  signal?: AbortSignal,
): Promise<AiRuntimeProviderWebSearchResult> {
  return callRuntime<AiRuntimeProviderWebSearchResult>(`/${runId}/provider-tools/web-search/settle`, input, { signal });
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
export async function confirmAiRuntimeCancellation(runId: string): Promise<AiRuntimeRunStopResult> {
  return callRuntime<AiRuntimeRunStopResult>(`/${runId}/cancel-confirm`, {});
}

/** 收敛全部过期执行租约，并取得需要由当前 Runtime 启动的后续 Run。 */
export async function reconcileAiRuntimeRuns(): Promise<AiRuntimeReconciliationResult> {
  return callRuntime<AiRuntimeReconciliationResult>('/reconcile', {});
}

/** 统一发起内部执行请求，并把统一失败响应转换为可判断的运行时错误。 */
/** 可传给内部 Runtime 请求的生命周期控制选项。 */
type RuntimeRequestOptions = {
  /** 当前模型步骤或工具调用的中止信号。 */
  signal?: AbortSignal;
};

/** 统一发起内部执行请求，并保持请求级取消信号贯穿到 NestJS。 */
async function callRuntime<TData>(path: string, body: unknown, options: RuntimeRequestOptions = {}): Promise<TData> {
  const response = await requestNest<TData>(`${AI_RUNTIME_PATH_PREFIX}${path}`, {
    method: 'POST',
    headers: { [AI_RUNTIME_TOKEN_HEADER]: readRuntimeServiceToken() },
    body,
    signal: options.signal,
  });

  if (options.signal?.aborted) {
    throw options.signal.reason ?? new DOMException('AI Runtime 请求已取消', 'AbortError');
  }

  if (!response.body.success) {
    throw new AiRuntimeRequestError(response.body.code, response.body.message, response.status);
  }

  return response.body.data;
}

/** 读取只有服务端持有的共享密钥；未配置或长度不足时立即失败，不降级为无鉴权调用。 */
function readRuntimeServiceToken(): string {
  const token = process.env.AI_RUNTIME_SERVICE_TOKEN;

  if (!token || token.length < AI_RUNTIME_SERVICE_TOKEN_MIN_LENGTH) {
    throw new AiRuntimeRequestError(
      'AI.RUNTIME_SERVICE_UNAUTHORIZED',
      '未配置有效的 AI_RUNTIME_SERVICE_TOKEN，AI 执行器无法调用内部接口',
      500,
    );
  }

  return token;
}
