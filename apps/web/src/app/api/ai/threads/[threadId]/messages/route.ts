/**
 * 本文件代理既有 AI 会话的消息历史查询与用户消息提交。
 * 活跃 Run 期间普通消息只会持久化排队，此时不会创建新 Run，也不会启动执行器。
 *
 * 历史查询的会话归属与来源失权投影都由 NestJS 强制，BFF 不做任何权限判断，
 * 也不改写响应内容，避免在转发层出现与服务端不一致的第二套规则。
 */
import { scheduleAgentRunFromProxyResponse } from '@/features/ai/runtime/ai-run-dispatch.server';
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

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

  await scheduleAgentRunFromProxyResponse(response, 'runId');

  return response;
}
