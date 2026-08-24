/**
 * 本文件确认 AI Run 候选，并在范围固化后启动同一条排队 Run。
 */

import { apiError } from '@/app/api/_utils/response';
import { startAiRunExecution } from '@/features/ai/runtime/ai-agent-runtime.server';
import {
  confirmAiRunScope,
  getAiRunExecutionPreparation,
  stopAiRun,
} from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { aiRunIdSchema, aiRunScopeConfirmationRequestSchema } from '@/features/ai/schemas/ai-request.schema';

/** 重新鉴权候选、固化多决策范围并返回真实 Agent 流。 */
export async function POST(request: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  const path = `/api/ai/runs/${runId}/scope/confirm`;
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
    return apiError({ status: 400, message: '决策候选确认格式不正确', path });
  }
  const parsed = aiRunScopeConfirmationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError({ status: 400, message: '决策候选确认格式不正确', path });
  }

  let confirmed = false;
  try {
    await confirmAiRunScope(authentication.identity, runId, parsed.data);
    confirmed = true;
    const creation = await getAiRunExecutionPreparation(authentication.identity, runId);
    return await startAiRunExecution({
      identity: authentication.identity,
      creation,
      contextSource: 'thread-history',
    });
  } catch (error) {
    if (confirmed) {
      await stopAiRun(authentication.identity, runId).catch(() => undefined);
    }
    return handleAiRouteError(error, path, '决策候选确认失败，请稍后重试');
  }
}
