/**
 * 本文件代理单个决策提案的状态变更请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策提案状态 BFF 路由参数。 */
type DecisionProposalStatusRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string; proposalId: string }>;
};

/** 转发拒绝或取消当前开放提案的请求。 */
export async function PATCH(request: Request, context: DecisionProposalStatusRouteContext) {
  const { decisionId, proposalId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'PATCH',
    nestPath: `/decisions/${decisionId}/proposals/${proposalId}/status`,
    fallbackMessage: '提案关闭失败，请稍后重试',
  });
}
