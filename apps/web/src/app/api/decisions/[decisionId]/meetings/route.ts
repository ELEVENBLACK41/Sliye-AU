/**
 * 本文件代理指定决策的会议列表与创建请求。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策会议 BFF 动态路由参数。 */
type DecisionMeetingsRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发会议列表查询。 */
export async function GET(request: Request, context: DecisionMeetingsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}/meetings`,
    fallbackMessage: '会议列表加载失败，请稍后重试',
  });
}

/** 转发会议创建请求。 */
export async function POST(request: Request, context: DecisionMeetingsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/meetings`,
    fallbackMessage: '会议创建失败，请稍后重试',
  });
}
