/**
 * 本文件代理单个决策的投票轮次查询和创建请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策投票轮次 BFF 路由参数。 */
type DecisionVoteRoundsRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发当前决策的投票轮次列表查询。 */
export async function GET(request: Request, context: DecisionVoteRoundsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}/vote-rounds`,
    fallbackMessage: '投票轮次加载失败，请稍后重试',
  });
}

/** 转发为当前决策的开放提案创建并开启投票的请求。 */
export async function POST(request: Request, context: DecisionVoteRoundsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/vote-rounds`,
    fallbackMessage: '创建投票失败，请稍后重试',
  });
}
