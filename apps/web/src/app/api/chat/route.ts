/**
 * 本文件实现受 `ai:chat:use` 保护的 AI SDK 流式对话接口。
 * 成功流保持 AI UI Message 协议，鉴权和参数失败使用统一 JSON 错误契约。
 */
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  tool,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { apiError, apiErrorFromUnknown } from '@/app/api/_utils/response';
import { hasSystemPermission } from '@/features/auth/services/auth-server.service';
import { getAuthenticatedRouteUser } from '@/server/bff/authenticated-nest-proxy';

/** AI 对话请求体运行时校验规则。 */
const chatRequestSchema = z.object({
  messages: z.array(z.custom<UIMessage>()),
});

/** 校验认证与权限后创建 AI SDK 流式响应。 */
export async function POST(request: Request) {
  const currentUser = await getAuthenticatedRouteUser();

  if (!currentUser) {
    return apiError({
      status: 401,
      message: '登录状态已失效，请重新登录',
      path: '/api/chat',
    });
  }

  if (!hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.ai.chatUse)) {
    return apiError({
      status: 403,
      message: '当前账号没有使用 AI 对话的权限',
      path: '/api/chat',
    });
  }

  try {
    const parsed = chatRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      return apiError({
        status: 400,
        message: 'AI 对话消息格式不正确',
        path: '/api/chat',
      });
    }

    const result = streamText({
      model: 'openai/gpt-4.1',
      messages: await convertToModelMessages(parsed.data.messages),
      stopWhen: isStepCount(5),
      tools: {
        weather: tool({
          description: '查询指定地点的模拟华氏温度',
          inputSchema: z.object({
            location: z.string().describe('需要查询天气的地点'),
          }),
          execute: async ({ location }) => ({
            location,
            temperature: Math.round(Math.random() * (90 - 32) + 32),
          }),
        }),
        convertFahrenheitToCelsius: tool({
          description: '把华氏温度转换为摄氏温度',
          inputSchema: z.object({
            temperature: z.number().describe('需要转换的华氏温度'),
          }),
          execute: async ({ temperature }) => ({
            celsius: Math.round((temperature - 32) * (5 / 9)),
          }),
        }),
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, 'AI 对话暂时不可用，请稍后重试', 500, '/api/chat');
  }
}
