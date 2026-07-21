/**
 * 本文件代理单个决策的参与者新增请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 参与者新增 BFF 路由参数。 */
type DecisionParticipantsRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发向当前决策新增参与者的请求。 */
export async function POST(request: Request, context: DecisionParticipantsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/participants`,
    fallbackMessage: '添加参与者失败，请稍后重试',
  });
}
