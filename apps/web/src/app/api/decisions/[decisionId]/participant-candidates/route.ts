/**
 * 本文件代理单个决策的可添加参与者候选查询，避免浏览器接触 NestJS 内部地址。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 参与者候选查询 BFF 路由参数。 */
type DecisionParticipantCandidatesRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发当前决策的参与者候选列表查询。 */
export async function GET(request: Request, context: DecisionParticipantCandidatesRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}/participant-candidates`,
    fallbackMessage: '参与者候选列表加载失败，请稍后重试',
  });
}
