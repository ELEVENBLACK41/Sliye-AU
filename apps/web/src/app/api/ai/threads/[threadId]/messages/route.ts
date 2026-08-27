/**
 * 本文件代理既有 AI 会话的消息历史查询与用户消息提交。
 * 活跃 Run 期间普通消息只会持久化排队，此时不会创建新 Run，也不会启动执行器。
 *
 * 历史查询的会话归属与来源失权投影都由 NestJS 强制，BFF 不做任何权限判断，
 * 也不改写响应内容，避免在转发层出现与服务端不一致的第二套规则。
 */
import { after } from 'next/server';
import type { ApiResponse } from '@workspace/contracts/common';
import {
  AI_MESSAGE_DISPATCH_STATES,
  AI_MESSAGE_SUBMISSION_MODES,
  type AiThreadMessageSubmissionResult,
} from '@workspace/contracts/ai';

import { createAiPostStreamResponse } from '@/features/ai/runtime/ai-post-stream-response.server';
import { startAiAgentRun } from '@/features/ai/runtime/ai-agent-runtime.server';
import { scheduleAgentRunFromProxyResponse } from '@/features/ai/runtime/ai-run-dispatch.server';
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';
import { apiError } from '@/app/api/_utils/response';

/** AI 会话消息路由参数。 */
type AiThreadRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ threadId: string }>;
};

/** 转发消息历史查询；游标与条数由查询字符串透传。 */
export async function GET(request: Request, context: AiThreadRouteContext) {
  const { threadId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/ai/threads/${threadId}/messages`,
    fallbackMessage: 'AI 消息历史加载失败，请稍后重试',
  });
}

/** 转发用户消息提交请求，并在真正创建 Run 时启动执行器。 */
export async function POST(request: Request, context: AiThreadRouteContext) {
  const { threadId } = await context.params;
  const response = await proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/ai/threads/${threadId}/messages`,
    fallbackMessage: 'AI 消息发送失败，请稍后重试',
  });

  if (acceptsAiPostStream(request)) {
    return createAiPostStreamFromSubmission(response, request);
  }

  await scheduleAgentRunFromProxyResponse(response, 'runId');

  return response;
}

/** 判断调用方是否显式请求 POST SSE；未请求时保持原 JSON 兼容路径。 */
function acceptsAiPostStream(request: Request): boolean {
  return request.headers
    .get('accept')
    ?.toLowerCase()
    .split(',')
    .some((value) => value.trim().split(';', 1)[0] === 'text/event-stream') ?? false;
}

/** 将 NestJS 提交回执接入当前 POST 响应流。 */
async function createAiPostStreamFromSubmission(response: Response, request: Request): Promise<Response> {
  if (!response.ok) {
    return response;
  }

  const parsed = await readAiThreadMessageSubmission(response);

  if (parsed === 'upstream-error') {
    return response;
  }

  if (!parsed) {
    return apiError({
      status: 502,
      message: 'AI 消息提交响应格式异常，请稍后再试',
      path: new URL(request.url).pathname,
    });
  }

  return createAiPostStreamResponse({
    submission: parsed.data,
    requestId: parsed.requestId,
    signal: request.signal,
    startRuntime: startAiAgentRun,
    registerRuntime: (callback) => after(callback),
  });
}

/** 读取提交回执中的统一成功响应，并校验直出流所需的最小字段。 */
async function readAiThreadMessageSubmission(
  response: Response,
): Promise<{ data: AiThreadMessageSubmissionResult; requestId: string } | 'upstream-error' | null> {
  try {
    const body = (await response.clone().json()) as ApiResponse<AiThreadMessageSubmissionResult>;

    if (!body.success) {
      return 'upstream-error';
    }

    if (!isAiThreadMessageSubmissionResult(body.data)) {
      return null;
    }

    return { data: body.data, requestId: body.requestId };
  } catch {
    return null;
  }
}

/** 校验已提交消息回执，避免异常上游数据启动不可恢复的 Runtime。 */
function isAiThreadMessageSubmissionResult(value: unknown): value is AiThreadMessageSubmissionResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.threadId === 'string' &&
    typeof candidate.messageId === 'string' &&
    (candidate.runId === null || typeof candidate.runId === 'string') &&
    typeof candidate.dispatchState === 'string' &&
    (AI_MESSAGE_DISPATCH_STATES as readonly string[]).includes(candidate.dispatchState) &&
    typeof candidate.queueSequence === 'number' &&
    Number.isSafeInteger(candidate.queueSequence) &&
    (AI_MESSAGE_SUBMISSION_MODES as readonly string[]).includes(candidate.submissionMode as string) &&
    typeof candidate.replayed === 'boolean'
  );
}
