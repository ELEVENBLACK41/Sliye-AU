/**
 * 本文件在刷新恢复或补充查询已精确解析范围后，继续执行同一条排队 AI Run。
 */

import { apiError } from '@/app/api/_utils/response';
import { startAiRunExecution } from '@/features/ai/runtime/ai-agent-runtime.server';
import { getAiRunExecutionPreparation } from '@/features/ai/runtime/ai-nest-client.server';
import { createAiRecoveryStreamResponse } from '@/features/ai/runtime/ai-stream.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { aiRunIdSchema } from '@/features/ai/schemas/ai-request.schema';

/** 重新鉴权并启动已经具备明确动态范围的排队 Run。 */
export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  const path = `/api/ai/runs/${runId}/start`;
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }
  if (!aiRunIdSchema.safeParse(runId).success) {
    return apiError({ status: 400, message: 'AI 运行标识不正确', path });
  }

  try {
    const creation = await getAiRunExecutionPreparation(authentication.identity, runId);
    if (creation.replayed) {
      return createAiRecoveryStreamResponse({
        identity: authentication.identity,
        threadId: creation.thread.id,
        runId: creation.run.id,
        afterSequence: 0,
        metadata: {
          threadId: creation.thread.id,
          messageId: creation.message.id,
          runId: creation.run.id,
          replayed: true,
        },
      });
    }
    return await startAiRunExecution({
      identity: authentication.identity,
      creation,
      contextSource: 'thread-history',
    });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 运行继续失败，请稍后重试');
  }
}
