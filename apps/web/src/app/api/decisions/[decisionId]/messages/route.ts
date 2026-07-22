/**
 * 本文件代理单个决策的群聊消息查询和发送请求，认证 Cookie 不会暴露给浏览器 JavaScript。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策群聊 BFF 路由参数。 */
type DecisionMessagesRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 转发决策群聊历史加载或断线补偿查询。 */
export async function GET(request: Request, context: DecisionMessagesRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'GET',
    nestPath: `/decisions/${decisionId}/messages`,
    fallbackMessage: '群聊消息加载失败，请稍后重试',
  });
}

/** 转发当前决策参与者的幂等文字消息发送请求。 */
export async function POST(request: Request, context: DecisionMessagesRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/messages`,
    fallbackMessage: '消息发送失败，请稍后重试',
  });
}
