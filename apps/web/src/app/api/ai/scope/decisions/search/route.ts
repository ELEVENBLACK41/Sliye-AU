/**
 * 本文件通过 Next.js BFF 返回当前用户可访问的安全决策候选。
 */

import { apiError, apiSuccess } from '@/app/api/_utils/response';
import { searchAccessibleAiDecisions } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { aiDecisionScopeSearchRequestSchema } from '@/features/ai/schemas/ai-request.schema';

/** 校验查询文本后转发到 NestJS 权限前置候选接口。 */
export async function POST(request: Request): Promise<Response> {
  const path = '/api/ai/scope/decisions/search';
  const authentication = await authenticateAiRoute(path);
  if (!authentication.ok) {
    return authentication.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, message: '决策候选查询格式不正确', path });
  }
  const parsed = aiDecisionScopeSearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({ status: 400, message: '决策候选查询格式不正确', path });
  }

  try {
    const result = await searchAccessibleAiDecisions(authentication.identity, parsed.data);
    return apiSuccess({ data: result, message: '决策候选查询成功' });
  } catch (error) {
    return handleAiRouteError(error, path, '决策候选查询失败，请稍后重试');
  }
}
