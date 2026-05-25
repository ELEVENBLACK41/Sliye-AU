import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  AuthProvider,
  AuthSessionStatus,
  UserStatus,
  type User,
  type UserPasswordCredential,
} from '../../generated/prisma';
import { AUTH_AUDIT_EVENTS } from './auth.constants';
import { toAuthUserResponse } from './auth.mapper';
import { ConfirmEmailDto } from './dto/confirm-email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { SendEmailVerificationDto } from './dto/send-email-verification.dto';
import { EmailVerificationService } from './services/email-verification.service';
import { AuthValidationService } from './services/auth-validation.service';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';
import {
  AuthRequestContext,
  AuthSessionResponse,
  AuthTokensResponse,
  AuthUserResponse,
  OperationResult,
  RegisterResponse,
  RequestClientMeta,
} from './types/auth.types';

type UserWithPasswordCredential = User & {
  passwordCredential: UserPasswordCredential | null;
};

interface AuditLogInput {
  userId?: number | null;
  event: string;
  success: boolean;
  reason?: string;
  metadata?: Record<string, string | number | boolean | null>;
  meta: RequestClientMeta;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // 注入认证链路所需的数据访问、校验、密码、令牌和邮箱验证码服务。
  constructor(
    private readonly prisma: PrismaService,
    private readonly validationService: AuthValidationService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly emailVerificationService: EmailVerificationService,
  ) {}

  // 注册用户并生成邮箱验证码。
  async register(
    dto: RegisterDto,
    meta: RequestClientMeta,
  ): Promise<RegisterResponse> {
    const input = this.validationService.parseRegister(dto);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { passwordCredential: true },
    });

    if (existingUser?.status === UserStatus.ACTIVE) {
      throw new ConflictException('Email is already registered');
    }

    if (
      existingUser?.status === UserStatus.DISABLED ||
      existingUser?.status === UserStatus.LOCKED
    ) {
      throw new ForbiddenException('Account is not available');
    }

    const passwordHash = await this.passwordService.hashPassword(
      input.password,
    );
    const now = new Date();

    const user = await this.prisma.$transaction(async (tx) => {
      if (existingUser) {
        const updatedUser = await tx.user.update({
          where: { id: existingUser.id },
          data: {
            name: input.name ?? existingUser.name,
            status: UserStatus.PENDING,
          },
        });

        await tx.userPasswordCredential.upsert({
          where: { userId: existingUser.id },
          update: {
            passwordHash,
            passwordAlgo: 'scrypt',
            passwordChangedAt: now,
          },
          create: {
            userId: existingUser.id,
            passwordHash,
            passwordAlgo: 'scrypt',
          },
        });

        return updatedUser;
      }

      return tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          status: UserStatus.PENDING,
          passwordCredential: {
            create: {
              passwordHash,
              passwordAlgo: 'scrypt',
            },
          },
        },
      });
    });

    const emailVerification = await this.emailVerificationService.issueCode(
      user,
      'register',
    );

    await this.writeAuditLog({
      userId: user.id,
      event: AUTH_AUDIT_EVENTS.registerRequested,
      success: true,
      metadata: { email: user.email },
      meta,
    });

    return {
      user: toAuthUserResponse(user),
      emailVerification,
    };
  }

  // 为未完成验证的用户重新发送邮箱验证码。
  async sendEmailVerification(
    dto: SendEmailVerificationDto,
    meta: RequestClientMeta,
  ) {
    const email = this.validationService.parseSendEmailVerification(dto);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new ForbiddenException('Please register first');
    }

    if (
      user.status === UserStatus.DISABLED ||
      user.status === UserStatus.LOCKED
    ) {
      throw new ForbiddenException('Account is not available');
    }

    if (user.status === UserStatus.ACTIVE && user.emailVerifiedAt) {
      return this.emailVerificationService.verificationNotRequired(user.email);
    }

    const emailVerification = await this.emailVerificationService.issueCode(
      user,
      'manual_resend',
      { respectCooldown: true },
    );

    await this.writeAuditLog({
      userId: user.id,
      event: AUTH_AUDIT_EVENTS.emailVerificationSent,
      success: true,
      metadata: { email: user.email },
      meta,
    });

    return emailVerification;
  }

  // 校验邮箱验证码、激活用户并创建登录会话。
  async confirmEmail(
    dto: ConfirmEmailDto,
    meta: RequestClientMeta,
  ): Promise<AuthSessionResponse> {
    const input = this.validationService.parseConfirmEmail(dto);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new ForbiddenException('Verification code is invalid or expired');
    }

    if (
      user.status === UserStatus.DISABLED ||
      user.status === UserStatus.LOCKED
    ) {
      throw new ForbiddenException('Account is not available');
    }

    if (user.status === UserStatus.ACTIVE && user.emailVerifiedAt) {
      throw new ConflictException('Email is already verified');
    }

    await this.emailVerificationService.consumeLatestCode(user, input.code);

    const activatedUser = await this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });

      await tx.authAccount.upsert({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.PASSWORD,
            providerAccountId: user.email,
          },
        },
        update: {
          userId: user.id,
        },
        create: {
          userId: user.id,
          provider: AuthProvider.PASSWORD,
          providerAccountId: user.email,
        },
      });

      return updatedUser;
    });

    await this.writeAuditLog({
      userId: activatedUser.id,
      event: AUTH_AUDIT_EVENTS.emailVerificationConfirmed,
      success: true,
      metadata: { email: activatedUser.email },
      meta,
    });

    return this.issueSession(activatedUser, meta);
  }

  // 校验登录凭据并签发当前设备的登录会话。
  async login(
    dto: LoginDto,
    meta: RequestClientMeta,
  ): Promise<AuthSessionResponse> {
    const input = this.validationService.parseLogin(dto);
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { passwordCredential: true },
    });

    //如果没成功记录日志
    if (!user?.passwordCredential) {
      await this.writeAuditLog({
        event: AUTH_AUDIT_EVENTS.loginFailed,
        success: false,
        reason: 'INVALID_CREDENTIALS',
        metadata: { email: input.email },
        meta,
      });
      throw new UnauthorizedException('Email or password is incorrect');
    }

    await this.assertAccountAvailableForLogin(user, meta); //如果账号不可用也记录日志，reason是ACCOUNT_NOT_AVAILABLE

    //验证密码
    const passwordMatched = await this.passwordService.verifyPassword(
      input.password,
      user.passwordCredential.passwordHash,
    );

    //如果密码不匹配记录日志，reason是INVALID_CREDENTIALS
    if (!passwordMatched) {
      await this.writeAuditLog({
        userId: user.id,
        event: AUTH_AUDIT_EVENTS.loginFailed,
        success: false,
        reason: 'INVALID_CREDENTIALS',
        metadata: { email: input.email },
        meta,
      });
      throw new UnauthorizedException('Email or password is incorrect');
    }

    //验证邮箱验证码
    await this.assertEmailVerifiedForLogin(user, meta);
    //到这里说明登录成功了，记录日志，event是loginSucceeded
    const session = await this.issueSession(user, meta);

    await this.writeAuditLog({
      userId: user.id,
      event: AUTH_AUDIT_EVENTS.loginSucceeded,
      success: true,
      metadata: { email: user.email },
      meta,
    });

    return session;
  }

  // 校验 refresh token 并完成令牌轮换。
  async refresh(
    dto: RefreshTokenDto,
    meta: RequestClientMeta,
  ): Promise<AuthSessionResponse> {
    const refreshToken = this.validationService.parseRefreshToken(dto);
    const tokenHash = this.tokenService.hashOpaqueToken(refreshToken);
    const now = new Date();
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        session: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.usedAt || storedToken.revokedAt) {
      await this.revokeSession(storedToken.sessionId, 'REFRESH_TOKEN_REUSE');
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.expiresAt <= now) {
      await this.expireSession(storedToken.sessionId);
      throw new UnauthorizedException('Refresh token expired');
    }

    const session = storedToken.session;
    const user = session.user;

    if (
      session.status !== AuthSessionStatus.ACTIVE ||
      session.expiresAt <= now ||
      user.status !== UserStatus.ACTIVE ||
      !user.emailVerifiedAt
    ) {
      if (session.expiresAt <= now) {
        await this.expireSession(session.id);
      }
      throw new UnauthorizedException('Session is not available');
    }

    const newRefreshToken = this.tokenService.issueRefreshToken(now);

    await this.prisma.$transaction(async (tx) => {
      const createdToken = await tx.refreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: newRefreshToken.tokenHash,
          expiresAt: newRefreshToken.expiresAt,
        },
      });

      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          usedAt: now,
          replacedByTokenId: createdToken.id,
        },
      });

      await tx.authSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: now,
          expiresAt: newRefreshToken.expiresAt,
        },
      });
    });

    const accessToken = this.tokenService.issueAccessToken({
      userId: user.id,
      email: user.email,
      sessionId: session.id,
    });

    await this.writeAuditLog({
      userId: user.id,
      event: AUTH_AUDIT_EVENTS.tokenRefreshed,
      success: true,
      metadata: { sessionId: session.id },
      meta,
    });

    return {
      user: toAuthUserResponse(user),
      tokens: this.buildTokenResponse(accessToken, newRefreshToken),
    };
  }

  // 注销当前认证上下文对应的登录会话。
  async logout(
    auth: AuthRequestContext,
    meta: RequestClientMeta,
  ): Promise<OperationResult> {
    await this.revokeSession(auth.sessionId, 'USER_LOGOUT');

    await this.writeAuditLog({
      userId: auth.userId,
      event: AUTH_AUDIT_EVENTS.logoutSucceeded,
      success: true,
      metadata: { sessionId: auth.sessionId },
      meta,
    });

    return { success: true };
  }

  // 查询可用用户的认证资料。
  async getProfile(userId: number): Promise<AuthUserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not available');
    }

    return toAuthUserResponse(user);
  }

  // 登录前检查账号状态是否允许使用。
  private async assertAccountAvailableForLogin(
    user: UserWithPasswordCredential,
    meta: RequestClientMeta,
  ): Promise<void> {
    if (
      user.status === UserStatus.DISABLED ||
      user.status === UserStatus.LOCKED
    ) {
      await this.writeAuditLog({
        userId: user.id,
        event: AUTH_AUDIT_EVENTS.loginFailed,
        success: false,
        reason: 'ACCOUNT_NOT_AVAILABLE',
        meta,
      });
      throw new ForbiddenException('Account is not available');
    }
  }

  // 登录前检查邮箱是否已经验证。
  private async assertEmailVerifiedForLogin(
    user: UserWithPasswordCredential,
    meta: RequestClientMeta,
  ): Promise<void> {
    if (user.status !== UserStatus.ACTIVE || !user.emailVerifiedAt) {
      await this.emailVerificationService.issueCode(user, 'login_unverified');
      await this.writeAuditLog({
        userId: user.id,
        event: AUTH_AUDIT_EVENTS.loginFailed,
        success: false,
        reason: 'EMAIL_NOT_VERIFIED',
        meta,
      });
      throw new ForbiddenException(
        'Email is not verified. A new code has been printed in server logs.',
      );
    }
  }

  // 创建服务端登录会话并签发 access/refresh token。
  private async issueSession(
    user: User,
    meta: RequestClientMeta,
  ): Promise<AuthSessionResponse> {
    const now = new Date();
    const refreshToken = this.tokenService.issueRefreshToken(now);

    const { session, updatedUser } = await this.prisma.$transaction(
      async (tx) => {
        const session = await tx.authSession.create({
          data: {
            userId: user.id,
            userAgent: meta.userAgent,
            ipAddress: meta.ipAddress,
            lastUsedAt: now,
            expiresAt: refreshToken.expiresAt,
            refreshTokens: {
              create: {
                tokenHash: refreshToken.tokenHash,
                expiresAt: refreshToken.expiresAt,
              },
            },
          },
        });

        const updatedUser = await tx.user.update({
          where: { id: user.id },
          data: { lastLoginAt: now },
        });

        return { session, updatedUser };
      },
    );

    const accessToken = this.tokenService.issueAccessToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      sessionId: session.id,
    });

    return {
      user: toAuthUserResponse(updatedUser),
      tokens: this.buildTokenResponse(accessToken, refreshToken),
    };
  }

  // 组装对外返回的 token 元数据。
  private buildTokenResponse(
    accessToken: { token: string; expiresAt: Date; expiresIn: number },
    refreshToken: { token: string; expiresAt: Date; expiresIn: number },
  ): AuthTokensResponse {
    return {
      tokenType: 'Bearer',
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt.toISOString(),
      accessTokenExpiresIn: accessToken.expiresIn,
      refreshToken: refreshToken.token,
      refreshTokenExpiresAt: refreshToken.expiresAt.toISOString(),
      refreshTokenExpiresIn: refreshToken.expiresIn,
    };
  }

  // 撤销指定登录会话及其所有未撤销 refresh token。
  private async revokeSession(
    sessionId: string,
    reason: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: {
          id: sessionId,
          status: AuthSessionStatus.ACTIVE,
        },
        data: {
          status: AuthSessionStatus.REVOKED,
          revokedAt: now,
          revokeReason: reason,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      }),
    ]);
  }

  // 将指定登录会话标记为过期。
  private async expireSession(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        status: AuthSessionStatus.ACTIVE,
      },
      data: {
        status: AuthSessionStatus.EXPIRED,
      },
    });
  }

  // 写入认证审计日志，失败时只记录警告避免阻塞主流程。
  private async writeAuditLog(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.authAuditLog.create({
        data: {
          userId: input.userId,
          event: input.event,
          success: input.success,
          reason: input.reason,
          ipAddress: input.meta.ipAddress,
          userAgent: input.meta.userAgent,
          metadata: input.metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to write auth audit log: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }
}
