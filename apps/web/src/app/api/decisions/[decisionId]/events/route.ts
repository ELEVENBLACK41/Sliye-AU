/**
 * 本文件代理单个决策的事件时间线请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策事件时间线 BFF 路由参数。 */
type DecisionEventsRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发单个决策的事件时间线查询。 */
export async function GET(request: Request, context: DecisionEventsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}/events`,
    fallbackMessage: '决策事件时间线加载失败，请稍后重试',
  });
}
