/**
 * 本文件只恢复指定 Run 的持久化事件，绝不创建消息、领取租约或启动执行器。
 */

import { createAiRecoveryStreamResponse } from '@/features/ai/runtime/ai-stream.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { apiError } from '@/app/api/_utils/response';

/** 校验恢复游标后创建持久化事件轮询流。 */
export async function GET(request: Request, context: { params: Promise<{ threadId: string }> }): Promise<Response> {
  const { threadId } = await context.params;
  const path = `/api/ai/threads/${threadId}/stream`;
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get('runId');
    const afterSequence = Number(url.searchParams.get('afterSequence') ?? '0');

    if (!runId || !Number.isInteger(afterSequence) || afterSequence < 0) {
      return apiError({ status: 400, message: 'AI 恢复参数不正确', path });
    }

    return createAiRecoveryStreamResponse({
      identity: authentication.identity,
      threadId,
      runId,
      afterSequence,
    });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 运行恢复失败，请稍后重试');
  }
}
