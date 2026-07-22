/**
 * 本文件代理决策投票的选票提交请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策选票提交 BFF 路由参数。 */
type DecisionBallotsRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string; voteRoundId: string }>;
};

/** 转发当前参与者向指定投票轮次提交选票的请求。 */
export async function POST(request: Request, context: DecisionBallotsRouteContext) {
  const { decisionId, voteRoundId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/vote-rounds/${voteRoundId}/ballots`,
    fallbackMessage: '提交选票失败，请稍后重试',
  });
}
