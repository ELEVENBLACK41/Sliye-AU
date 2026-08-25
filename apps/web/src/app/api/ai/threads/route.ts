/**
 * 本文件代理创建 AI 会话请求，并在响应返回后启动 Agent Runtime。
 * Thread 不接收任何业务目标字段，业务对象由 Agent 从用户消息中发现。
 */
import { scheduleAgentRunFromProxyResponse } from '@/features/ai/runtime/ai-run-dispatch.server';
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 转发创建 AI 会话与首个运行的请求。 */
export async function POST(request: Request) {
  const response = await proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: '/ai/threads',
    fallbackMessage: 'AI 会话创建失败，请稍后重试',
  });

  await scheduleAgentRunFromProxyResponse(response, 'runId');

  return response;
}
