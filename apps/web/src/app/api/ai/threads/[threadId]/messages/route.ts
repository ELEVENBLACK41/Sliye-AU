/**
 * 本文件读取既有 AI Thread 的持久化历史，或创建消息与 Run 并启动真实 Agent 流。
 */

import type { ListAiThreadMessagesQuery } from '@workspace/contracts/ai';

import {
  aiChatStreamRequestSchema,
  aiThreadIdSchema,
  aiThreadMessagesQuerySchema,
  getLatestUserMessageText,
} from '@/features/ai/schemas/ai-request.schema';
import { startAiRunExecution } from '@/features/ai/runtime/ai-agent-runtime.server';
import {
  createAiRecoveryStreamResponse,
  createAiScopeResolutionStreamResponse,
} from '@/features/ai/runtime/ai-stream.server';
import {
  createAiMessageRun,
  discoverAiRunScope,
  getAiRunScope,
  listAiThreadMessages,
  stopAiRun,
} from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { apiError, apiSuccess } from '@/app/api/_utils/response';

/** 校验分页白名单并返回指定 Thread 的权威消息历史。 */
export async function GET(request: Request, context: { params: Promise<{ threadId: string }> }): Promise<Response> {
  const { threadId } = await context.params;
  const path = `/api/ai/threads/${threadId}/messages`;
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  if (!aiThreadIdSchema.safeParse(threadId).success) {
    return apiError({ status: 400, message: 'AI 会话标识不正确', path });
  }

  const parsed = aiThreadMessagesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parsed.success) {
    return apiError({ status: 400, message: 'AI 会话消息查询参数不正确', path });
  }

  try {
    const page = await listAiThreadMessages(
      authentication.identity,
      threadId,
      parsed.data satisfies ListAiThreadMessagesQuery,
    );
    return apiSuccess({ data: page, message: 'AI 会话消息获取成功' });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 会话消息获取失败，请稍后重试');
  }
}

/** 校验请求并为指定 Thread 创建下一条消息和 Run。 */
export async function POST(request: Request, context: { params: Promise<{ threadId: string }> }): Promise<Response> {
  const { threadId } = await context.params;
  const path = `/api/ai/threads/${threadId}/messages`;
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
    return apiError({ status: 400, message: 'AI 消息格式不正确', path });
  }

  const parsed = aiChatStreamRequestSchema.safeParse(body);
  const content = parsed.success ? getLatestUserMessageText(parsed.data.messages) : null;

  if (!parsed.success || !content) {
    return apiError({ status: 400, message: 'AI 消息格式不正确', path });
  }

  let createdRunId: string | null = null;
  try {
    const creation = await createAiMessageRun(authentication.identity, threadId, {
      content,
      clientRequestId: parsed.data.clientRequestId,
      modelRole: 'standard',
    });
    createdRunId = creation.replayed ? null : creation.run.id;

    const scope = creation.replayed
      ? await getAiRunScope(authentication.identity, creation.run.id)
      : await discoverAiRunScope(authentication.identity, creation.run.id, { query: content });
    if (scope.resolution.status !== 'RESOLVED') {
      return createAiScopeResolutionStreamResponse({
        metadata: {
          threadId: creation.thread.id,
          messageId: creation.message.id,
          runId: creation.run.id,
          replayed: creation.replayed,
        },
        scope,
      });
    }

    if (creation.replayed && creation.run.status !== 'QUEUED') {
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
    if (createdRunId) {
      await stopAiRun(authentication.identity, createdRunId).catch(() => undefined);
    }
    return handleAiRouteError(error, path, 'AI 消息发送失败，请稍后重试');
  }
}
