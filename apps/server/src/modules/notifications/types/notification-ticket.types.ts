/**
 * 本文件定义全站通知 Socket Ticket 验签后的服务端内部载荷。
 */

/** 只绑定一个登录用户及其服务端会话的短期 Ticket 载荷。 */
export type NotificationTicketPayload = {
  /** 当前登录用户主键。 */
  sub: number;
  /** 当前服务端登录会话主键。 */
  sid: string;
  /** Ticket 唯一标识。 */
  jti: string;
  /** 签发时间戳，单位为秒。 */
  iat: number;
  /** 过期时间戳，单位为秒。 */
  exp: number;
  /** 固定凭证类型，防止其他 Token 混用。 */
  type: 'notification';
};
