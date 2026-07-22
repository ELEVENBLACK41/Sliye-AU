/**
 * 本文件代理决策群聊短期 Socket Ticket 请求，登录 Cookie 和 Access Token 保持在 BFF 内部。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 决策群聊 Ticket BFF 路由参数。 */
type DecisionChatTicketRouteContext = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 为当前登录会话转发指定决策的短期 Socket Ticket 请求。 */
export async function POST(request: Request, context: DecisionChatTicketRouteContext) {
  const { decisionId } = await context.params;

  return proxyAuthenticatedNestRequest({
    request,
    method: 'POST',
    nestPath: `/decisions/${decisionId}/chat-ticket`,
    fallbackMessage: '实时连接凭证获取失败，请稍后重试',
  });
}
