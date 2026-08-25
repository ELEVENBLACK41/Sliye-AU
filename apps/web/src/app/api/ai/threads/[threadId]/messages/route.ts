/**
 * 本文件代理在既有 AI 会话中提交用户消息的请求。
 * 活跃 Run 期间普通消息只会持久化排队，此时不会创建新 Run，也不会启动执行器。
 */
import { scheduleAgentRunFromProxyResponse } from '@/features/ai/runtime/ai-run-dispatch.server';
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** AI 会话消息路由参数。 */
type AiThreadRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ threadId: string }>;
};

/** 转发用户消息提交请求，并在真正创建 Run 时启动执行器。 */
export async function POST(request: Request, context: AiThreadRouteContext) {
  const { threadId } = await context.params;
  const response = await proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/ai/threads/${threadId}/messages`,
    fallbackMessage: 'AI 消息发送失败，请稍后重试',
  });

  await scheduleAgentRunFromProxyResponse(response, 'runId');

  return response;
}
