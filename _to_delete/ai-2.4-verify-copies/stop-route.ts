/**
 * 本文件代理停止当前 AI 运行的请求。
 * 停止只会请求取消：执行中的 Run 先失效租约，再由执行器确认或由服务端对账收敛。
 */
import { after } from 'next/server';

import { startAgentRunFromProxyResponse } from '@/features/ai/runtime/ai-run-dispatch.server';
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** AI 运行路由参数。 */
type AiRunRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ runId: string }>;
};

/** 转发停止请求，并在旧 Run 立即终态且领取到队首消息时启动下一个执行器。 */
export async function POST(request: Request, context: AiRunRouteContext) {
  const { runId } = await context.params;
  const response = await proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/ai/runs/${runId}/stop`,
    fallbackMessage: 'AI 运行停止失败，请稍后重试',
  });

  after(() => startAgentRunFromProxyResponse(response, 'nextRunId'));

  return response;
}
