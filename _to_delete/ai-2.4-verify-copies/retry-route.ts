/**
 * 本文件代理重试已结束 AI 运行的请求。
 * 重试始终创建关联旧 Run 的新 Run，不会让终态 Run 回退。
 */
import { after } from 'next/server';

import { startAgentRunFromProxyResponse } from '@/features/ai/runtime/ai-run-dispatch.server';
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** AI 运行路由参数。 */
type AiRunRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ runId: string }>;
};

/** 转发重试请求，并为新创建的 Run 启动执行器。 */
export async function POST(request: Request, context: AiRunRouteContext) {
  const { runId } = await context.params;
  const response = await proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/ai/runs/${runId}/retry`,
    fallbackMessage: 'AI 运行重试失败，请稍后重试',
  });

  after(() => startAgentRunFromProxyResponse(response, 'runId'));

  return response;
}
