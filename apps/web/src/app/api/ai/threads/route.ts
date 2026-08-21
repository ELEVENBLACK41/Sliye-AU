/**
 * 本文件创建绑定单项决策的 AI Thread，并启动第一个真实 Agent Run 流。
 */

import { aiChatStreamRequestSchema, getLatestUserMessageText } from '@/features/ai/schemas/ai-request.schema';
import { startAiRunExecution } from '@/features/ai/runtime/ai-agent-runtime.server';
import { createInitialAiRun, stopAiRun } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { apiError } from '@/app/api/_utils/response';

/** 校验请求、原子创建状态并由当前 BFF 请求领取执行。 */
export async function POST(request: Request): Promise<Response> {
  const path = '/api/ai/threads';
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  let createdRunId: string | null = null;

  try {
    const parsed = aiChatStreamRequestSchema.safeParse(await request.json());
    const content = parsed.success ? getLatestUserMessageText(parsed.data.messages) : null;

    if (!parsed.success || !content) {
      return apiError({ status: 400, message: 'AI 消息格式不正确', path });
    }

    const creation = await createInitialAiRun(authentication.identity, {
      decisionId: parsed.data.decisionId,
      content,
      clientRequestId: parsed.data.clientRequestId,
      modelRole: 'standard',
    });
    createdRunId = creation.replayed ? null : creation.run.id;

    return await startAiRunExecution({
      identity: authentication.identity,
      creation,
      uiMessages: parsed.data.messages,
    });
  } catch (error) {
    if (createdRunId) {
      await stopAiRun(authentication.identity, createdRunId).catch(() => undefined);
    }
    return handleAiRouteError(error, path, 'AI 会话启动失败，请稍后重试');
  }
}
