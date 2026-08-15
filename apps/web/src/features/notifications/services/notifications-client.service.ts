/**
 * 本文件提供浏览器获取全站通知 Socket Ticket 的请求方法。
 */
import type { NotificationSocketTicket } from '@workspace/contracts/notifications';

import { requestData } from '@/services/request';

/** 获取只绑定当前登录用户和会话的通知 Socket Ticket。 */
export function getNotificationSocketTicket(): Promise<NotificationSocketTicket> {
  return requestData<NotificationSocketTicket>('/api/notifications/socket-ticket', {
    method: 'POST',
    errorMessage: '暂时无法连接实时通知服务',
  });
}
