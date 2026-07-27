/**
 * 本文件签发和验证只绑定当前登录用户与会话的全站通知 Socket Ticket。
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationSocketTicket } from '@workspace/contracts/notifications';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NotificationTicketPayload } from '../types/notification-ticket.types';

const DEFAULT_TICKET_TTL_SECONDS = 5 * 60;
const DEVELOPMENT_TICKET_SECRET =
  'nextnest-development-notification-ticket-secret-change-me';

/** 签发通知 Ticket 所需的可信身份输入。 */
type IssueNotificationTicketInput = {
  /** 当前用户主键。 */
  userId: number;
  /** 当前登录会话主键。 */
  sessionId: string;
};

@Injectable()
export class NotificationTicketService {
  private readonly logger = new Logger(NotificationTicketService.name);
  private readonly secret: string;
  private readonly ttlSeconds: number;

  /** 读取通知 Ticket 专用密钥与有效期。 */
  constructor(private readonly configService: ConfigService) {
    this.secret = this.readSecret();
    this.ttlSeconds = this.readPositiveInteger(
      'NOTIFICATION_SOCKET_TICKET_TTL_SECONDS',
      DEFAULT_TICKET_TTL_SECONDS,
    );
  }

  /** 为当前登录会话签发只能进入自己私人通知频道的短期 Ticket。 */
  issue(input: IssueNotificationTicketInput): NotificationSocketTicket {
    const now = Math.floor(Date.now() / 1000);
    const payload: NotificationTicketPayload = {
      sub: input.userId,
      sid: input.sessionId,
      jti: randomUUID(),
      iat: now,
      exp: now + this.ttlSeconds,
      type: 'notification',
    };
    const header = this.encodeJson({ alg: 'HS256', typ: 'JWT' });
    const body = this.encodeJson(payload);
    const signature = this.sign(`${header}.${body}`);

    return {
      ticket: `${header}.${body}.${signature}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      namespace: '/notifications',
    };
  }

  /** 验证 Ticket 的签名、类型、用户、会话和有效期字段。 */
  verify(ticket: string): NotificationTicketPayload {
    const parts = ticket.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid notification ticket');
    }

    const [rawHeader, rawPayload, rawSignature] = parts;
    const expectedSignature = this.sign(`${rawHeader}.${rawPayload}`);
    if (!this.safeEqual(rawSignature, expectedSignature)) {
      throw new UnauthorizedException('Invalid notification ticket');
    }

    const header = this.decodeJson<{ alg?: string; typ?: string }>(rawHeader);
    const payload = this.decodeJson<NotificationTicketPayload>(rawPayload);
    if (
      header.alg !== 'HS256' ||
      header.typ !== 'JWT' ||
      payload.type !== 'notification' ||
      !Number.isInteger(payload.sub) ||
      payload.sub < 1 ||
      typeof payload.sid !== 'string' ||
      payload.sid.length === 0 ||
      typeof payload.jti !== 'string' ||
      payload.jti.length === 0 ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw new UnauthorizedException('Invalid notification ticket');
    }

    return payload;
  }

  /** 读取生产环境必配、开发环境可安全回退的通知 Ticket 密钥。 */
  private readSecret(): string {
    const configuredSecret = this.configService.get<string>(
      'NOTIFICATION_SOCKET_TICKET_SECRET',
    );
    if (configuredSecret && configuredSecret.length >= 32) {
      return configuredSecret;
    }

    this.logger.warn(
      'NOTIFICATION_SOCKET_TICKET_SECRET is not set. Using development fallback secret.',
    );
    return DEVELOPMENT_TICKET_SECRET;
  }

  /** 读取正整数配置，非法值回退到默认值。 */
  private readPositiveInteger(key: string, fallback: number): number {
    const rawValue = this.configService.get<string | number>(key);
    const value = rawValue === undefined ? fallback : Number(rawValue);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  /** 将普通对象编码为 Ticket 使用的 base64url 字符串。 */
  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  /** 解码 Ticket JSON，格式错误统一按无效凭证处理。 */
  private decodeJson<T>(value: string): T {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException('Invalid notification ticket');
    }
  }

  /** 使用通知专用密钥生成 HMAC-SHA256 签名。 */
  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  /** 使用固定时间比较签名，避免泄露逐字节匹配信息。 */
  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
