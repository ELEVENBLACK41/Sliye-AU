/**
 * 本文件代理 AI 会话重命名。
 * 标题归一化与空标题校验由 NestJS 负责，重命名不会改变会话的最后活动时间。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** AI 会话路由参数。 */
type AiThreadRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ threadId: string }>;
};

/** 转发会话重命名请求。 */
export async function PUT(request: Request, context: AiThreadRouteContext) {
  const { threadId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'PUT',
    nestPath: `/ai/threads/${threadId}/title`,
    fallbackMessage: '会话重命名失败，请稍后重试',
  });
}
