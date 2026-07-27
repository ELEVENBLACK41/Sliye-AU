/**
 * 本文件定义全站实时通知、Socket Ticket 和事件映射的前后端共享契约。
 */

/** 当前已支持的全站通知类型。 */
export type NotificationType = 'MEETING_INVITED' | 'MEETING_ENDED';

/** 通知中可选的会议导航信息。 */
export type NotificationMeetingSummary = {
  /** 会议数据库主键。 */
  id: number;
  /** 会议标题。 */
  title: string;
};

/** 通知中可选的业务操作人摘要。 */
export type NotificationActorSummary = {
  /** 操作人数据库主键。 */
  id: number;
  /** 操作人展示名称。 */
  name: string;
};

/** 服务端实时推送到当前登录用户的通知。 */
export type RealtimeNotification = {
  /** 用于客户端幂等去重的稳定事件标识。 */
  id: string;
  /** 通知业务类型。 */
  type: NotificationType;
  /** Sonner 主标题。 */
  title: string;
  /** Sonner 详细说明。 */
  message: string;
  /** 通知发生时间，使用 ISO 8601 字符串。 */
  occurredAt: string;
  /** 关联会议；没有会议语义的通知可以为空。 */
  meeting?: NotificationMeetingSummary;
  /** 触发通知的操作人；系统事件可以为空。 */
  actor?: NotificationActorSummary;
};

/** 浏览器连接全站通知命名空间所需的短期凭证。 */
export type NotificationSocketTicket = {
  /** 只允许连接当前登录用户私人频道的签名凭证。 */
  ticket: string;
  /** 凭证过期时间。 */
  expiresAt: string;
  /** Socket.IO 固定通知命名空间。 */
  namespace: '/notifications';
};

/** 全站通知服务端向浏览器推送的强类型事件映射。 */
export type NotificationRealtimeEvents = {
  /** 当前用户收到一条新的业务通知。 */
  'notification.created': RealtimeNotification;
};
