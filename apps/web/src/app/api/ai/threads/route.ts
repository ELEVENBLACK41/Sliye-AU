/**
 * 本文件代理 AI 会话列表查询与创建请求，并在创建响应返回后启动 Agent Runtime。
 * Thread 不接收任何业务目标字段，业务对象由 Agent 从用户消息中发现。
 * 数据范围由 NestJS 按 Thread 所有者强制，BFF 只负责携带登录态转发。
 */
import { after } from 'next/server';
import type { ApiResponse } from '@workspace/contracts/common';
import type { AiPostStreamSubmissionData, AiThreadRunCommandResult } from '@workspace/contracts/ai';

import { apiError } from '@/app/api/_utils/response';
import { createAiPostStreamResponse } from '@/features/ai/runtime/ai-post-stream-response.server';
import { startAiAgentRun } from '@/features/ai/runtime/ai-agent-runtime.server';
import { scheduleAgentRunFromProxyResponse } from '@/features/ai/runtime/ai-run-dispatch.server';
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发会话列表查询；游标、条数与归档筛选由查询字符串透传。 */
export async function GET(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: '/ai/threads',
    fallbackMessage: 'AI 会话列表加载失败，请稍后重试',
  });
}

/** 转发创建 AI 会话与首个运行的请求。 */
export async function POST(request: Request) {
  const response = await proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/ai/threads',
    fallbackMessage: 'AI 会话创建失败，请稍后重试',
  });

  if (acceptsAiPostStream(request)) {
    return createAiPostStreamFromCreation(response, request);
  }

  await scheduleAgentRunFromProxyResponse(response, 'runId');

  return response;
}

/** 判断调用方是否显式请求新会话 POST SSE；未请求时保持原 JSON 兼容路径。 */
function acceptsAiPostStream(request: Request): boolean {
  return (
    request.headers
      .get('accept')
      ?.toLowerCase()
      .split(',')
      .some((value) => value.trim().split(';', 1)[0] === 'text/event-stream') ?? false
  );
}

/** 把新 Thread 的创建回执映射为统一 POST SSE submission 并启动当前 Run。 */
async function createAiPostStreamFromCreation(response: Response, request: Request): Promise<Response> {
  if (!response.ok) {
    return response;
  }

  const parsed = await readAiThreadCreation(response);

  if (parsed === 'upstream-error') {
    return response;
  }

  if (!parsed) {
    return apiError({
      status: 502,
      message: 'AI 会话创建响应格式异常，请稍后再试',
      path: new URL(request.url).pathname,
    });
  }

  const submission: AiPostStreamSubmissionData = {
    threadId: parsed.data.threadId,
    messageId: parsed.data.messageId,
    runId: parsed.data.runId,
    dispatchState: 'DISPATCHED',
    queueSequence: 1,
    submissionMode: 'NORMAL',
    replayed: parsed.data.replayed,
  };

  return createAiPostStreamResponse({
    submission,
    requestId: parsed.requestId,
    signal: request.signal,
    startRuntime: startAiAgentRun,
    registerRuntime: (callback) => after(callback),
  });
}

/** 读取并校验新 Thread 创建接口的统一成功回执。 */
async function readAiThreadCreation(
  response: Response,
): Promise<{ data: AiThreadRunCommandResult; requestId: string } | 'upstream-error' | null> {
  try {
    const body = (await response.clone().json()) as ApiResponse<AiThreadRunCommandResult>;

    if (!body.success) {
      return 'upstream-error';
    }

    if (
      typeof body.data.threadId !== 'string' ||
      typeof body.data.messageId !== 'string' ||
      typeof body.data.runId !== 'string' ||
      typeof body.data.replayed !== 'boolean'
    ) {
      return null;
    }

    return { data: body.data, requestId: body.requestId };
  } catch {
    return null;
  }
}
