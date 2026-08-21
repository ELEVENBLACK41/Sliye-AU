/**
 * 本文件封装 Web Agent Runtime 到 NestJS AI 领域接口的服务端调用。
 * Bearer token 与服务密钥只存在于当前 Node 进程，绝不写入流事件或日志。
 */
import 'server-only';

import type {
  AiDecisionContext,
  AiRun,
  AiRunCreation,
  AiRunEventPage,
  AiRunExecutionLease,
  AppendAiTextDeltaRequest,
  ClaimAiRunExecutionRequest,
  CompleteAiRunExecutionRequest,
  ConfirmAiRunCancellationRequest,
  CreateAiThreadMessageRunRequest,
  CreateAiThreadRunRequest,
  FailAiRunExecutionRequest,
  RecordAiModelStepRequest,
  RenewAiRunExecutionRequest,
  RetryAiRunRequest,
  StartAiToolCallRequest,
  FinishAiToolCallRequest,
  AiToolCall,
} from '@workspace/contracts/ai';
import type { ApiErrorResponse } from '@workspace/contracts/common';

import { requestNest } from '@/services/bff-request';

/** 仅用于本机开发和测试的固定回退值，必须与 NestJS Guard 一致。 */
const DEVELOPMENT_AI_RUNTIME_SERVICE_SECRET = 'nextnest-ai-runtime-development-only-secret';

/** 调用 NestJS AI 接口所需的当前用户服务端身份。 */
export type AiNestIdentity = {
  /** 当前用户的内部主键，用于 Gateway 安全归因。 */
  userId: number;
  /** 仅服务端使用的当前 Bearer token。 */
  accessToken: string;
};

/** 统一保留 NestJS 稳定错误响应的服务端异常。 */
export class AiNestRequestError extends Error {
  /** NestJS 或 BFF 返回的 HTTP 状态。 */
  readonly status: number;
  /** NestJS 统一错误响应。 */
  readonly response: ApiErrorResponse;

  /** 从一次失败的 NestJS 请求创建可分支处理的异常。 */
  constructor(status: number, response: ApiErrorResponse) {
    super(response.message);
    this.name = 'AiNestRequestError';
    this.status = status;
    this.response = response;
  }
}

/** 原子创建 Thread、首条消息和排队 Run。 */
export function createInitialAiRun(
  identity: AiNestIdentity,
  request: CreateAiThreadRunRequest,
): Promise<AiRunCreation> {
  return requestAiNest('/ai/threads', identity, { method: 'POST', body: request });
}

/** 在既有 Thread 中原子创建消息和排队 Run。 */
export function createAiMessageRun(
  identity: AiNestIdentity,
  threadId: string,
  request: CreateAiThreadMessageRunRequest,
): Promise<AiRunCreation> {
  return requestAiNest(`/ai/threads/${threadId}/messages`, identity, { method: 'POST', body: request });
}

/** 从失败或取消 Run 创建新 Run。 */
export function retryAiRun(
  identity: AiNestIdentity,
  runId: string,
  request: RetryAiRunRequest,
): Promise<AiRunCreation> {
  return requestAiNest(`/ai/runs/${runId}/retry`, identity, { method: 'POST', body: request });
}

/** 请求停止排队或执行中的 Run。 */
export function stopAiRun(identity: AiNestIdentity, runId: string): Promise<AiRun> {
  return requestAiNest(`/ai/runs/${runId}/stop`, identity, { method: 'POST' });
}

/** 原子领取排队 Run 并取得 execution lease。 */
export function claimAiRun(
  identity: AiNestIdentity,
  runId: string,
  request: ClaimAiRunExecutionRequest,
): Promise<AiRunExecutionLease> {
  return requestAiNest(`/ai/runs/${runId}/execution/claim`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 续租当前 execution lease。 */
export function renewAiRun(
  identity: AiNestIdentity,
  runId: string,
  request: RenewAiRunExecutionRequest,
): Promise<AiRunExecutionLease> {
  return requestAiNest(`/ai/runs/${runId}/execution/renew`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 持久化助手文本增量事件。 */
export function appendAiTextDelta(
  identity: AiNestIdentity,
  runId: string,
  request: AppendAiTextDeltaRequest,
): Promise<unknown> {
  return requestAiNest(`/ai/runs/${runId}/execution/text-deltas`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 持久化一次真实模型调用和 Token/成本。 */
export function recordAiModelStep(
  identity: AiNestIdentity,
  runId: string,
  request: RecordAiModelStepRequest,
): Promise<unknown> {
  return requestAiNest(`/ai/runs/${runId}/execution/steps`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 写入助手最终消息并完成 Run。 */
export function completeAiRun(
  identity: AiNestIdentity,
  runId: string,
  request: CompleteAiRunExecutionRequest,
): Promise<AiRun> {
  return requestAiNest(`/ai/runs/${runId}/execution/complete`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 把执行中 Run 收敛为失败终态。 */
export function failAiRun(identity: AiNestIdentity, runId: string, request: FailAiRunExecutionRequest): Promise<AiRun> {
  return requestAiNest(`/ai/runs/${runId}/execution/fail`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 确认 Abort 生效并写入取消终态。 */
export function confirmAiRunCancellation(
  identity: AiNestIdentity,
  runId: string,
  request: ConfirmAiRunCancellationRequest,
): Promise<AiRun> {
  return requestAiNest(`/ai/runs/${runId}/execution/confirm-cancellation`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 工具真正执行前保存其安全输入审计。 */
export function startAiToolCall(
  identity: AiNestIdentity,
  runId: string,
  request: StartAiToolCallRequest,
): Promise<AiToolCall> {
  return requestAiNest(`/ai/runs/${runId}/execution/tool-calls/start`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 工具执行结束后保存受控结果摘要或稳定错误。 */
export function finishAiToolCall(
  identity: AiNestIdentity,
  runId: string,
  request: FinishAiToolCallRequest,
): Promise<AiToolCall> {
  return requestAiNest(`/ai/runs/${runId}/execution/tool-calls/finish`, identity, {
    method: 'POST',
    body: request,
    internal: true,
  });
}

/** 调用唯一真实窄工具并返回授权后的决策上下文。 */
export function getAiDecisionContext(
  identity: AiNestIdentity,
  runId: string,
  executionLeaseId: string,
  decisionId: number,
): Promise<AiDecisionContext> {
  return requestAiNest(`/ai/runtime/runs/${runId}/tools/decisions/${decisionId}/context`, identity, {
    method: 'GET',
    internal: true,
    executionLeaseId,
  });
}

/** 补拉指定 Run 已经持久化的事件，调用本身不会启动执行器。 */
export function getAiRunEvents(
  identity: AiNestIdentity,
  threadId: string,
  runId: string,
  afterSequence: number,
): Promise<AiRunEventPage> {
  const query = new URLSearchParams({ runId, afterSequence: String(afterSequence) });
  return requestAiNest(`/ai/threads/${threadId}/stream?${query}`, identity, { method: 'GET' });
}

/** 向 NestJS 发起一条认证请求，并把失败响应转换为统一异常。 */
async function requestAiNest<TData, TBody = unknown>(
  path: string,
  identity: AiNestIdentity,
  options: {
    method: 'GET' | 'POST';
    body?: TBody;
    internal?: boolean;
    executionLeaseId?: string;
  },
): Promise<TData> {
  const headers = new Headers({ Authorization: `Bearer ${identity.accessToken}` });

  if (options.internal) {
    headers.set('x-ai-runtime-service-secret', resolveAiRuntimeServiceSecret());
  }
  if (options.executionLeaseId) {
    headers.set('x-ai-execution-lease-id', options.executionLeaseId);
  }

  const response = await requestNest<TData, TBody>(path, {
    method: options.method,
    headers,
    body: options.body,
  });

  if (!response.body.success) {
    throw new AiNestRequestError(response.status, response.body);
  }

  return response.body.data;
}

/** 生产环境强制使用显式密钥，开发和测试与 NestJS 使用相同本机回退。 */
function resolveAiRuntimeServiceSecret(): string {
  const configured = process.env.AI_RUNTIME_SERVICE_SECRET;

  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AI_RUNTIME_SERVICE_SECRET is required in production');
  }

  return DEVELOPMENT_AI_RUNTIME_SERVICE_SECRET;
}
