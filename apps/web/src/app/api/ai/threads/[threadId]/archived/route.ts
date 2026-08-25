/**
 * 本文件代理 AI 会话归档与恢复。
 * 归档要求会话没有活跃 Run，该判断与写入由 NestJS 在同一把行锁内完成。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** AI 会话路由参数。 */
type AiThreadRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ threadId: string }>;
};

/** 转发归档或恢复请求。 */
export async function PUT(request: Request, context: AiThreadRouteContext) {
  const { threadId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'PUT',
    nestPath: `/ai/threads/${threadId}/archived`,
    fallbackMessage: '会话归档状态更新失败，请稍后重试',
  });
}
