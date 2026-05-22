import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { AUTH_DEFAULTS } from '../auth.constants';
import { AccessTokenPayload } from '../types/auth.types';

interface AccessTokenInput {
  userId: number;
  email: string;
  sessionId: string;
}

interface IssuedAccessToken {
  token: string;
  expiresAt: Date;
  expiresIn: number;
}

interface IssuedRefreshToken {
  token: string;
  tokenHash: string;
  expiresAt: Date;
  expiresIn: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessSecret: string;
  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.accessSecret = this.readSecret();
    this.accessTokenTtlSeconds = this.readPositiveInteger(
      'AUTH_ACCESS_TOKEN_TTL_SECONDS',
      AUTH_DEFAULTS.accessTokenTtlSeconds,
    );
    this.refreshTokenTtlSeconds = this.readPositiveInteger(
      'AUTH_REFRESH_TOKEN_TTL_SECONDS',
      AUTH_DEFAULTS.refreshTokenTtlSeconds,
    );
  }

  issueAccessToken(input: AccessTokenInput): IssuedAccessToken {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.accessTokenTtlSeconds;
    const payload: AccessTokenPayload = {
      sub: input.userId,
      email: input.email,
      sid: input.sessionId,
      type: 'access',
      iat: now,
      exp: now + expiresIn,
      jti: randomUUID(),
    };

    const header = this.encodeJson({ alg: 'HS256', typ: 'JWT' });
    const body = this.encodeJson(payload);
    const signature = this.sign(`${header}.${body}`);

    return {
      token: `${header}.${body}.${signature}`,
      expiresAt: new Date(payload.exp * 1000),
      expiresIn,
    };
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const parts = token.split('.');

    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid access token');
    }

    const [rawHeader, rawPayload, rawSignature] = parts;
    const expectedSignature = this.sign(`${rawHeader}.${rawPayload}`);

    if (!this.safeEqual(rawSignature, expectedSignature)) {
      throw new UnauthorizedException('Invalid access token');
    }

    const header = this.decodeJson<{ alg?: string; typ?: string }>(rawHeader);
    const payload = this.decodeJson<AccessTokenPayload>(rawPayload);

    if (
      header.alg !== 'HS256' ||
      header.typ !== 'JWT' ||
      payload.type !== 'access' ||
      !payload.sub ||
      !payload.sid ||
      !payload.email ||
      !payload.exp
    ) {
      throw new UnauthorizedException('Invalid access token');
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Access token expired');
    }

    return payload;
  }

  issueRefreshToken(now = new Date()): IssuedRefreshToken {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(
      now.getTime() + this.refreshTokenTtlSeconds * 1000,
    );

    return {
      token,
      tokenHash: this.hashOpaqueToken(token),
      expiresAt,
      expiresIn: this.refreshTokenTtlSeconds,
    };
  }

  hashOpaqueToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private readSecret(): string {
    const configuredSecret =
      this.configService.get<string>('AUTH_ACCESS_TOKEN_SECRET') ??
      this.configService.get<string>('JWT_SECRET');

    if (configuredSecret && configuredSecret.length >= 32) {
      return configuredSecret;
    }

    this.logger.warn(
      'AUTH_ACCESS_TOKEN_SECRET is not set. Using development fallback secret.',
    );
    return 'nextnest-development-access-secret-change-me';
  }

  private readPositiveInteger(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const value = rawValue ? Number(rawValue) : fallback;

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decodeJson<T>(value: string): T {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.accessSecret)
      .update(value)
      .digest('base64url');
  }

  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
