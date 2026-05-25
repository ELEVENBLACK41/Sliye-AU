import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { type User } from '../../../generated/prisma';
import { AUTH_DEFAULTS } from '../auth.constants';
import { EmailVerificationState } from '../types/auth.types';

type EmailVerificationUser = Pick<User, 'id' | 'email'>;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);
  private readonly ttlSeconds: number;
  private readonly cooldownSeconds: number;
  private readonly maxAttempts: number;
  private readonly codeSecret: string;

  // 注入 Prisma 和配置服务并读取验证码相关配置。
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.readPositiveInteger(
      'AUTH_EMAIL_CODE_TTL_SECONDS',
      AUTH_DEFAULTS.emailCodeTtlSeconds,
    );
    this.cooldownSeconds = this.readPositiveInteger(
      'AUTH_EMAIL_CODE_COOLDOWN_SECONDS',
      AUTH_DEFAULTS.emailCodeCooldownSeconds,
    );
    this.maxAttempts = this.readPositiveInteger(
      'AUTH_EMAIL_CODE_MAX_ATTEMPTS',
      AUTH_DEFAULTS.emailCodeMaxAttempts,
    );
    this.codeSecret = this.readCodeSecret();
  }

  // 生成新的邮箱验证码并只保存验证码哈希。
  async issueCode(
    user: EmailVerificationUser,
    purpose: string,
    options: { respectCooldown?: boolean } = {},
  ): Promise<EmailVerificationState> {
    const now = new Date();

    if (options.respectCooldown) {
      await this.assertCooldown(user, now);
    }

    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        sentTo: user.email,
        usedAt: null,
      },
      data: {
        usedAt: now,
      },
    });

    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        sentTo: user.email,
        tokenHash: this.hashCode(user.email, code),
        lastSentAt: now,
        expiresAt,
      },
    });

    this.logger.warn(
      `[EmailVerification] purpose=${purpose} email=${user.email} code=${code} expiresAt=${expiresAt.toISOString()}`,
    );

    return {
      required: true,
      sentTo: user.email,
      expiresAt: expiresAt.toISOString(),
      cooldownSeconds: this.cooldownSeconds,
    };
  }

  // 消费用户最新的未使用邮箱验证码。
  async consumeLatestCode(
    user: EmailVerificationUser,
    code: string,
  ): Promise<void> {
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        sentTo: user.email,
        usedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!token) {
      throw new BadRequestException('Verification code is invalid or expired');
    }

    const now = new Date();

    if (token.expiresAt <= now) {
      await this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      });
      throw new BadRequestException('Verification code is invalid or expired');
    }

    if (token.attemptCount >= this.maxAttempts) {
      await this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { usedAt: now },
      });
      throw new BadRequestException('Verification code has too many attempts');
    }

    const matched = this.safeEqual(
      token.tokenHash,
      this.hashCode(user.email, code),
    );

    if (!matched) {
      await this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: { attemptCount: { increment: 1 } },
      });
      throw new BadRequestException('Verification code is invalid or expired');
    }

    await this.prisma.emailVerificationToken.update({
      where: { id: token.id },
      data: { usedAt: now },
    });
  }

  // 返回邮箱无需验证时的统一状态。
  verificationNotRequired(email: string): EmailVerificationState {
    return {
      required: false,
      sentTo: email,
      expiresAt: null,
      cooldownSeconds: this.cooldownSeconds,
    };
  }

  // 检查验证码重发冷却时间。
  private async assertCooldown(
    user: EmailVerificationUser,
    now: Date,
  ): Promise<void> {
    if (this.cooldownSeconds <= 0) {
      return;
    }

    const latestToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        sentTo: user.email,
        usedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!latestToken?.lastSentAt) {
      return;
    }

    const elapsedSeconds =
      (now.getTime() - latestToken.lastSentAt.getTime()) / 1000;

    if (elapsedSeconds < this.cooldownSeconds) {
      throw new HttpException(
        `Please retry after ${Math.ceil(
          this.cooldownSeconds - elapsedSeconds,
        )} seconds`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // 使用邮箱、验证码和服务端密钥生成验证码哈希。
  private hashCode(email: string, code: string): string {
    return createHash('sha256')
      .update(`${email}:${code}:${this.codeSecret}`)
      .digest('hex');
  }

  // 读取邮箱验证码哈希密钥。
  private readCodeSecret(): string {
    const configuredSecret = this.configService.get<string>(
      'AUTH_EMAIL_CODE_SECRET',
    );

    if (configuredSecret && configuredSecret.length >= 32) {
      return configuredSecret;
    }

    this.logger.warn(
      'AUTH_EMAIL_CODE_SECRET is not set. Using development fallback secret.',
    );
    return 'nextnest-development-email-code-secret';
  }

  // 读取正整数配置项并在非法时使用默认值。
  private readPositiveInteger(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);
    const value = rawValue ? Number(rawValue) : fallback;

    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  // 使用固定时间比较避免哈希比较时序泄露。
  private safeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }
}
