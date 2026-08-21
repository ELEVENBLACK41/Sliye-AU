/**
 * 本文件在既有 AI Thread 中创建消息与 Run，并启动真实 Agent 流。
 */

import { aiChatStreamRequestSchema, getLatestUserMessageText } from '@/features/ai/schemas/ai-request.schema';
import { startAiRunExecution } from '@/features/ai/runtime/ai-agent-runtime.server';
import { createAiMessageRun, stopAiRun } from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { apiError } from '@/app/api/_utils/response';

/** 校验请求并为指定 Thread 创建下一条消息和 Run。 */
export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }): Promise<Response> {
  const { threadId } = await context.params;
  const path = `/api/ai/threads/${threadId}/messages`;
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

    const creation = await createAiMessageRun(authentication.identity, threadId, {
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
    return handleAiRouteError(error, path, 'AI 消息发送失败，请稍后重试');
  }
}
