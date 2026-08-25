/**
 * 本文件代理 AI 会话列表查询与创建请求，并在创建响应返回后启动 Agent Runtime。
 * Thread 不接收任何业务目标字段，业务对象由 Agent 从用户消息中发现。
 * 数据范围由 NestJS 按 Thread 所有者强制，BFF 只负责携带登录态转发。
 */
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

  await scheduleAgentRunFromProxyResponse(response, 'runId');

  return response;
}
