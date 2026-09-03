/**
 * 本文件代理单条 AI 会话详情查询。
 * 会话归属由 NestJS 强制，非所有者统一返回“不存在”，BFF 不做额外权限判断。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** AI 会话路由参数。 */
type AiThreadRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ threadId: string }>;
};

/** 转发会话详情查询，附带当前活跃 Run 快照。 */
export async function GET(request: Request, context: AiThreadRouteContext) {
  const { threadId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/ai/threads/${threadId}`,
    fallbackMessage: 'AI 会话详情加载失败，请稍后重试',
  });
}
