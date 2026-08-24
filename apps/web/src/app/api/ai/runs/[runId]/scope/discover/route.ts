/**
 * 本文件允许用户补充问题后重新发现同一排队 Run 的授权决策范围。
 */

import { apiError, apiSuccess } from '@/app/api/_utils/response';
import { discoverAiRunScope } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { aiDecisionScopeSearchRequestSchema, aiRunIdSchema } from '@/features/ai/schemas/ai-request.schema';

/** 校验补充查询并返回精确范围、候选或空结果状态。 */
export async function POST(request: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  const path = `/api/ai/runs/${runId}/scope/discover`;
  const authentication = await authenticateAiRoute(path);
  if (!authentication.ok) {
    return authentication.response;
  }
  if (!aiRunIdSchema.safeParse(runId).success) {
    return apiError({ status: 400, message: 'AI 运行标识不正确', path });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, message: '范围发现请求格式不正确', path });
  }
  const parsed = aiDecisionScopeSearchRequestSchema.omit({ limit: true }).safeParse(body);
  if (!parsed.success) {
    return apiError({ status: 400, message: '范围发现请求格式不正确', path });
  }

  try {
    const result = await discoverAiRunScope(authentication.identity, runId, parsed.data);
    return apiSuccess({ data: result, message: 'AI 运行范围发现完成' });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 运行范围发现失败，请稍后重试');
  }
}
