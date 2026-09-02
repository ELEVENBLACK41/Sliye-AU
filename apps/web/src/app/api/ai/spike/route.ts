/**
 * 本文件提供 C2 临时 Workspace Agent UI Message Stream Spike Route。
 * Route 只负责认证、请求形状校验和调用编排服务，主工作台不会调用本入口。
 */

import { API_ERROR_CODES } from '@workspace/contracts/common';
import { z } from 'zod';

import { apiError } from '@/app/api/_utils/response';
import { startAiAgentSpike } from '@/features/ai/runtime/ai-agent-spike.server';
import { hasAiRuntimeServiceToken } from '@/features/ai/runtime/ai-runtime-client.server';
import { hasSystemPermission } from '@/features/auth/services/auth-server.service';
import {
  getAuthenticatedRouteUser,
  resolveAuthenticatedAccessToken,
} from '@/server/bff/authenticated-nest-proxy';

/** C2 临时 Route 的请求体校验规则；只接受最后一条用户 UIMessage 和 Thread 标识。 */
const agentSpikeRequestSchema = z.object({
  threadId: z.string().trim().min(1).max(64),
  message: z
    .object({
      id: z.string().trim().min(1).max(128),
      role: z.literal('user'),
      parts: z.array(z.unknown()).min(1),
    })
    .passthrough(),
});

/** C2 临时 Route 的请求体类型。 */
type AgentSpikeRequest = z.infer<typeof agentSpikeRequestSchema>;

/** 只验证认证与请求边界后启动隔离的官方 UI Message Stream Spike。 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const path = '/api/ai/spike';
  const currentUser = await getAuthenticatedRouteUser();

  if (!currentUser) {
    return apiError({
      status: 401,
      message: '登录状态已失效，请重新登录',
      path,
      requestId,
    });
  }

  if (!hasSystemPermission(currentUser, 'ai:chat:use')) {
    return apiError({
      status: 403,
      message: '当前账号没有使用 AI 对话的权限',
      path,
      requestId,
    });
  }

  const parsed = await parseAgentSpikeRequest(request);

  if (!parsed.success) {
    return apiError({
      status: 400,
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message: 'AI Spike 请求格式不正确',
      path,
      requestId,
    });
  }

  if (!hasAiRuntimeServiceToken()) {
    return apiError({
      status: 503,
      code: API_ERROR_CODES.AI_RUNTIME_SERVICE_UNAUTHORIZED,
      message: 'AI Spike 服务端运行凭据未配置，请联系管理员',
      path,
      requestId,
    });
  }

  const messageText = extractUserMessageText(parsed.data.message);

  if (!messageText) {
    return apiError({
      status: 400,
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message: 'AI Spike 只支持包含文本的用户消息',
      path,
      requestId,
    });
  }

  const accessToken = await resolveAuthenticatedAccessToken();

  if (!accessToken) {
    return apiError({
      status: 401,
      message: '登录状态已失效，请重新登录',
      path,
      requestId,
    });
  }

  return startAiAgentSpike({
    requestId,
    accessToken,
    userId: currentUser.id,
    threadId: parsed.data.threadId,
    message: parsed.data.message,
    messageText,
  });
}

/** 安全读取并校验 C2 请求体，JSON 解析失败也统一归为请求格式错误。 */
async function parseAgentSpikeRequest(
  request: Request,
): Promise<ReturnType<typeof agentSpikeRequestSchema.safeParse>> {
  try {
    return agentSpikeRequestSchema.safeParse(await request.json());
  } catch {
    return agentSpikeRequestSchema.safeParse(undefined);
  }
}

/** 从最后一条用户 UIMessage 提取文本，拒绝没有可交给模型的文本内容。 */
function extractUserMessageText(message: AgentSpikeRequest['message']): string | null {
  const text = message.parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('')
    .trim();

  return text.length > 0 ? text : null;
}

/** 判断一个未知 UIMessage part 是否为可提交的文本 part。 */
function isTextPart(value: unknown): value is { type: 'text'; text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'text' &&
    typeof (value as { text?: unknown }).text === 'string'
  );
}
