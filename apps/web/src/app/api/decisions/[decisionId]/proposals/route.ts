/**
 * 本文件代理单个决策的提案查询和创建请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策提案 BFF 路由参数。 */
type DecisionProposalsRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发当前决策的提案列表查询。 */
export async function GET(request: Request, context: DecisionProposalsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}/proposals`,
    fallbackMessage: '提案列表加载失败，请稍后重试',
  });
}

/** 转发向当前决策创建提案的请求。 */
export async function POST(request: Request, context: DecisionProposalsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/proposals`,
    fallbackMessage: '创建提案失败，请稍后重试',
  });
}
