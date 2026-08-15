/**
 * 本文件代理决策投票关闭请求，并保留 NestJS 返回的最终统计与业务错误。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策投票关闭 BFF 路由参数。 */
type DecisionVoteRoundCloseRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string; voteRoundId: string }>;
};

/** 转发负责人关闭指定投票轮次的请求。 */
export async function POST(request: Request, context: DecisionVoteRoundCloseRouteContext) {
  const { decisionId, voteRoundId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/vote-rounds/${voteRoundId}/close`,
    fallbackMessage: '关闭投票失败，请稍后重试',
  });
}
