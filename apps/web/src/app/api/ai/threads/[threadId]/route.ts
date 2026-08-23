/**
 * 本文件为浏览器提供 AI Thread 安全详情、重命名、归档与恢复 BFF。
 */

import type { UpdateAiThreadRequest } from '@workspace/contracts/ai';

import { apiError, apiSuccess } from '@/app/api/_utils/response';
import { aiThreadIdSchema, aiThreadUpdateRequestSchema } from '@/features/ai/schemas/ai-request.schema';
import { getAiThreadDetail, updateAiThread } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';

/** 校验 Thread 标识并返回当前用户有权读取的安全详情。 */
export async function GET(_request: Request, context: { params: Promise<{ threadId: string }> }): Promise<Response> {
  const { threadId } = await context.params;
  const path = `/api/ai/threads/${threadId}`;
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  if (!aiThreadIdSchema.safeParse(threadId).success) {
    return apiError({ status: 400, message: 'AI 会话标识不正确', path });
  }

  try {
    const detail = await getAiThreadDetail(authentication.identity, threadId);
    return apiSuccess({ data: detail, message: 'AI 会话详情获取成功' });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 会话详情获取失败，请稍后重试');
  }
}

/** 仅把校验通过的标题与归档字段转发给 NestJS。 */
export async function PATCH(request: Request, context: { params: Promise<{ threadId: string }> }): Promise<Response> {
  const { threadId } = await context.params;
  const path = `/api/ai/threads/${threadId}`;
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  if (!aiThreadIdSchema.safeParse(threadId).success) {
    return apiError({ status: 400, message: 'AI 会话标识不正确', path });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError({ status: 400, message: 'AI 会话更新参数不正确', path });
  }

  const parsed = aiThreadUpdateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError({ status: 400, message: 'AI 会话更新参数不正确', path });
  }

  try {
    const result = await updateAiThread(
      authentication.identity,
      threadId,
      parsed.data satisfies UpdateAiThreadRequest,
    );
    return apiSuccess({ data: result, message: 'AI 会话更新成功' });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 会话更新失败，请稍后重试');
  }
}
