/**
 * 本文件把当前浏览器会话的全站通知 Socket Ticket 请求转发到 NestJS。
 */
import { proxyAuthenticatedNestRequest } from '@/server/bff/authenticated-nest-proxy';

/** 为当前登录用户签发短期通知 Socket Ticket。 */
export async function POST(request: Request) {
  return proxyAuthenticatedNestRequest({
    request,
    nestPath: '/notifications/socket-ticket',
    method: 'POST',
    fallbackMessage: '获取实时通知连接凭证失败',
  });
}
