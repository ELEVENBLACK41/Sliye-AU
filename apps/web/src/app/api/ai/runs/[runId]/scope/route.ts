/**
 * 本文件通过 Next.js BFF 返回指定 AI Run 的权威动态范围快照。
 */

import { apiError, apiSuccess } from '@/app/api/_utils/response';
import { getAiRunScope } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { aiRunIdSchema } from '@/features/ai/schemas/ai-request.schema';

/** 重新鉴权后读取指定 Run 当前范围状态。 */
export async function GET(_request: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  const path = `/api/ai/runs/${runId}/scope`;
  const authentication = await authenticateAiRoute(path);
  if (!authentication.ok) {
    return authentication.response;
  }
  if (!aiRunIdSchema.safeParse(runId).success) {
    return apiError({ status: 400, message: 'AI 运行标识不正确', path });
  }

  try {
    const result = await getAiRunScope(authentication.identity, runId);
    return apiSuccess({ data: result, message: 'AI 运行范围获取成功' });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 运行范围获取失败，请稍后重试');
  }
}
