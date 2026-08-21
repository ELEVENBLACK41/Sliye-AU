/**
 * 本文件先在 NestJS 请求 Run 取消，再通知当前 BFF 进程的 AbortController。
 */

import { apiSuccess } from '@/app/api/_utils/response';
import { abortAiRunExecutor } from '@/features/ai/runtime/ai-agent-runtime.server';
import { stopAiRun } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';

/** 推进取消状态并触发本地执行器停止。 */
export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  const path = `/api/ai/runs/${runId}/stop`;
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  try {
    const run = await stopAiRun(authentication.identity, runId);

    if (run.status === 'CANCELLATION_REQUESTED') {
      abortAiRunExecutor(runId);
    }

    return apiSuccess({ data: run, message: '已请求停止 AI 运行' });
  } catch (error) {
    return handleAiRouteError(error, path, '停止 AI 运行失败，请稍后重试');
  }
}
