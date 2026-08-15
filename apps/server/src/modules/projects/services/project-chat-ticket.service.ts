/**
 * 本文件使用独立密钥签发和验证绑定项目、分区、用户及登录会话的短期 Socket Ticket。
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProjectChatTicket } from '@workspace/contracts/projects';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ProjectChatTicketPayload } from '../types/project-chat-ticket.types';

/** 未显式配置时使用的 Ticket 有效时长。 */
const DEFAULT_TICKET_TTL_SECONDS = 5 * 60;

/** 开发环境使用的独立 Ticket 密钥。 */
const DEVELOPMENT_TICKET_SECRET =
  'nextnest-development-chat-ticket-secret-change-me';

/** 签发分区 Ticket 所需的可信输入。 */
type IssueProjectChatTicketInput = {
  /** 当前用户主键。 */
  userId: number;
  /** 当前登录会话主键。 */
  sessionId: string;
  /** 目标项目主键。 */
  projectId: number;
  /** 目标讨论分区主键。 */
  areaId: number;
};

@Injectable()
export class ProjectChatTicketService {
  private readonly logger = new Logger(ProjectChatTicketService.name);
  private readonly secret: string;
  private readonly ttlSeconds: number;

  /** 读取 Ticket 专用密钥和有效期配置。 */
  constructor(private readonly configService: ConfigService) {
    this.secret = this.readSecret();
    this.ttlSeconds = this.readPositiveInteger(
      'CHAT_SOCKET_TICKET_TTL_SECONDS',
      DEFAULT_TICKET_TTL_SECONDS,
    );
  }

  /** 签发只允许连接指定项目分区的短期 Ticket。 */
  issue(input: IssueProjectChatTicketInput): ProjectChatTicket {
    const now = Math.floor(Date.now() / 1000);
    const payload: ProjectChatTicketPayload = {
      sub: input.userId,
      sid: input.sessionId,
      projectId: input.projectId,
      areaId: input.areaId,
      jti: randomUUID(),
      iat: now,
      exp: now + this.ttlSeconds,
      type: 'project-chat',
    };
    const header = this.encodeJson({ alg: 'HS256', typ: 'JWT' });
    const body = this.encodeJson(payload);
    const signature = this.sign(`${header}.${body}`);

    return {
      ticket: `${header}.${body}.${signature}`,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
      namespace: '/project-chat',
    };
  }

  /** 校验 Ticket 签名、类型、身份、分区范围和过期时间。 */
  verify(ticket: string): ProjectChatTicketPayload {
    const parts = ticket.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid project chat ticket');
    }

    const [rawHeader, rawPayload, rawSignature] = parts;
    const expectedSignature = this.sign(`${rawHeader}.${rawPayload}`);
    if (!this.safeEqual(rawSignature, expectedSignature)) {
      throw new UnauthorizedException('Invalid project chat ticket');
    }

    const header = this.decodeJson<{ alg?: string; typ?: string }>(rawHeader);
    const payload = this.decodeJson<ProjectChatTicketPayload>(rawPayload);
    if (
      header.alg !== 'HS256' ||
      header.typ !== 'JWT' ||
      payload.type !== 'project-chat' ||
      !Number.isInteger(payload.sub) ||
      payload.sub < 1 ||
      typeof payload.sid !== 'string' ||
      payload.sid.length === 0 ||
      !Number.isInteger(payload.projectId) ||
      payload.projectId < 1 ||
      !Number.isInteger(payload.areaId) ||
      payload.areaId < 1 ||
      typeof payload.jti !== 'string' ||
      payload.jti.length === 0 ||
      !Number.isInteger(payload.iat) ||
      !Number.isInteger(payload.exp)
    ) {
      throw new UnauthorizedException('Invalid project chat ticket');
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Project chat ticket expired');
    }

    return payload;
  }

  /** 读取 Ticket 专用密钥，开发环境允许使用明确的本地兜底值。 */
  private readSecret(): string {
    const configuredSecret = this.configService.get<string>(
      'CHAT_SOCKET_TICKET_SECRET',
    );
    if (configuredSecret && configuredSecret.length >= 32) {
      return configuredSecret;
    }

    this.logger.warn(
      'CHAT_SOCKET_TICKET_SECRET is not set. Using development fallback secret.',
    );
    return DEVELOPMENT_TICKET_SECRET;
  }

  /** 读取正整数配置，非法值回退到默认值。 */
  private readPositiveInteger(key: string, fallback: number): number {
    const rawValue = this.configService.get<string | number>(key);
    const value = rawValue === undefined ? fallback : Number(rawValue);
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  /** 将 JSON 编码为 JWT 使用的 base64url 字符串。 */
  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  /** 解码 Ticket JSON，格式错误统一视为无效凭证。 */
  private decodeJson<T>(value: string): T {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException('Invalid project chat ticket');
    }
  }

  /** 使用 Ticket 专用密钥生成 HMAC-SHA256 签名。 */
  private sign(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  /** 使用固定时间比较校验签名。 */
  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }
}
