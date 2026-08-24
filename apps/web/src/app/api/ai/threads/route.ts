/**
 * 本文件创建绑定单项决策的 AI Thread，并启动第一个真实 Agent Run 流。
 */

import { aiChatStreamRequestSchema, getLatestUserMessageText } from '@/features/ai/schemas/ai-request.schema';
import { startAiRunExecution } from '@/features/ai/runtime/ai-agent-runtime.server';
import {
  createInitialAiRun,
  discoverAiRunScope,
  listAiThreads,
  stopAiRun,
} from '@/features/ai/runtime/ai-nest-client.server';
import { authenticateAiRoute, handleAiRouteError } from '@/features/ai/runtime/ai-route.server';
import { apiError, apiSuccess } from '@/app/api/_utils/response';
import type { ListAiThreadsQuery } from '@workspace/contracts/ai';
import { z } from 'zod';

/** BFF 仅接受 2.5 首版历史列表的白名单查询参数。 */
const aiThreadListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    archiveState: z.enum(['active', 'archived']).optional(),
    decisionId: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

/** 读取当前用户仍可访问的 AI Thread 历史页。 */
export async function GET(request: Request): Promise<Response> {
  const path = '/api/ai/threads';
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
  }

  const parsed = aiThreadListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));

  if (!parsed.success) {
    return apiError({ status: 400, message: 'AI 会话列表查询参数不正确', path });
  }

  try {
    const page = await listAiThreads(authentication.identity, parsed.data satisfies ListAiThreadsQuery);
    return apiSuccess({ data: page, message: 'AI 会话历史获取成功' });
  } catch (error) {
    return handleAiRouteError(error, path, 'AI 会话历史获取失败，请稍后重试');
  }
}

/** 校验请求、原子创建状态并由当前 BFF 请求领取执行。 */
export async function POST(request: Request): Promise<Response> {
  const path = '/api/ai/threads';
  const authentication = await authenticateAiRoute(path);

  if (!authentication.ok) {
    return authentication.response;
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
    const creation = await createInitialAiRun(authentication.identity, {
      decisionId: parsed.data.decisionId,
      content,
      clientRequestId: parsed.data.clientRequestId,
      modelRole: 'standard',
    });
    createdRunId = creation.replayed ? null : creation.run.id;

    if (parsed.data.decisionId === undefined) {
      const scope = await discoverAiRunScope(authentication.identity, creation.run.id, { query: content });
      if (scope.resolution.status !== 'RESOLVED') {
        return apiSuccess({
          data: {
            threadId: creation.thread.id,
            messageId: creation.message.id,
            ...scope,
          },
          message:
            scope.resolution.status === 'AWAITING_CONFIRMATION'
              ? '请确认本次对话要使用的决策候选'
              : '未找到可用决策，请补充更明确的决策名称',
        });
      }
    }

    return await startAiRunExecution({
      identity: authentication.identity,
      creation,
      contextSource: 'created-message',
    });
  } catch (error) {
    if (createdRunId) {
      await stopAiRun(authentication.identity, createdRunId).catch(() => undefined);
    }
    return handleAiRouteError(error, path, 'AI 会话启动失败，请稍后重试');
  }
}
