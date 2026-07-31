/**
 * 本文件定义仅在 NestJS 内部使用的项目分区 Socket Ticket 载荷。
 */

/** 短期分区聊天 Ticket 中经过签名保护的身份和房间范围。 */
export type ProjectChatTicketPayload = {
  /** 当前登录用户主键。 */
  sub: number;
  /** 当前服务端登录会话主键。 */
  sid: string;
  /** Ticket 唯一允许加入的项目主键。 */
  projectId: number;
  /** Ticket 唯一允许加入的讨论分区主键。 */
  areaId: number;
  /** Ticket 唯一标识。 */
  jti: string;
  /** Ticket 签发时间戳，单位为秒。 */
  iat: number;
  /** Ticket 过期时间戳，单位为秒。 */
  exp: number;
  /** 固定凭证类型，防止其他 JWT 被误用于 Socket 鉴权。 */
  type: 'project-chat';
};
