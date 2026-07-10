/**
 * 本文件代理单个决策详情请求，越权结果保持后端统一 404。
 */
import { proxyAuthenticatedNestRequest } from '@/features/auth/services/authenticated-bff-proxy.service';

/** 决策详情 BFF 路由参数。 */
type DecisionRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发单个决策详情查询。 */
export async function GET(request: Request, context: DecisionRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}`,
    fallbackMessage: '决策详情加载失败，请稍后重试',
  });
}
