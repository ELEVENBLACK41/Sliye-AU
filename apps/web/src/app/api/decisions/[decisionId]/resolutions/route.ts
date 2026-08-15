/**
 * 本文件代理单个决策的正式决议查询与创建请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策正式决议 BFF 路由参数。 */
type DecisionResolutionsRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发当前决策的正式决议列表查询。 */
export async function GET(request: Request, context: DecisionResolutionsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}/resolutions`,
    fallbackMessage: '正式决议加载失败，请稍后重试',
  });
}

/** 转发采纳提案并创建最终正式决议的请求。 */
export async function POST(request: Request, context: DecisionResolutionsRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/resolutions`,
    fallbackMessage: '正式决议创建失败，请稍后重试',
  });
}
