/**
 * 本文件从失败或取消 Run 幂等创建新 Run，并按同一执行协议启动流。
 */

import type { UIMessage } from 'ai';

import { aiRetryStreamRequestSchema } from '@/features/ai/schemas/ai-request.schema';
import { startAiRunExecution } from '@/features/ai/runtime/ai-agent-runtime.server';
import { retryAiRun, stopAiRun } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { apiError } from '@/app/api/_utils/response';

/** 创建关联旧 Run 的新 Run，并使用权威用户消息重新执行。 */
export async function POST(request: Request, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  const { runId } = await context.params;
  const path = `/api/ai/runs/${runId}/retry`;
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  let createdRunId: string | null = null;

  try {
    const parsed = aiRetryStreamRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError({ status: 400, message: 'AI 重试参数不正确', path });
    }

    const creation = await retryAiRun(authentication.identity, runId, parsed.data);
    createdRunId = creation.replayed ? null : creation.run.id;
    const uiMessages: UIMessage[] = [
      {
        id: creation.message.id,
        role: 'user',
        parts: [{ type: 'text', text: creation.message.content }],
      },
    ];

    return await startAiRunExecution({ identity: authentication.identity, creation, uiMessages });
  } catch (error) {
    if (createdRunId) {
      await stopAiRun(authentication.identity, createdRunId).catch(() => undefined);
    }
    return handleAiRouteError(error, path, 'AI 运行重试失败，请稍后再试');
  }
}
