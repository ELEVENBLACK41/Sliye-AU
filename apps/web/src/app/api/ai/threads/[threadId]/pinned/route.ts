/**
 * 本文件代理固定或取消固定 AI 会话。
 * 固定数量上限、幂等与归档互斥规则全部由 NestJS 在事务内强制。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** AI 会话路由参数。 */
type AiThreadRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ threadId: string }>;
};

/** 转发固定状态变更请求。 */
export async function PUT(request: Request, context: AiThreadRouteContext) {
  const { threadId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'PUT',
    nestPath: `/ai/threads/${threadId}/pinned`,
    fallbackMessage: '会话固定状态更新失败，请稍后重试',
  });
}
