/**
 * 本文件代理单个决策的状态更新请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策状态更新 BFF 路由参数。 */
type DecisionStatusRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发单个决策的状态更新请求。 */
export async function PATCH(request: Request, context: DecisionStatusRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'PATCH',
    nestPath: `/decisions/${decisionId}/status`,
    fallbackMessage: '决策状态更新失败，请稍后重试',
  });
}
