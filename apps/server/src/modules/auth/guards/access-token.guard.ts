import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuthSessionStatus, UserStatus } from '../../../generated/prisma';
import { toAuthUserResponse } from '../auth.mapper';
import { TokenService } from '../services/token.service';
import { AuthenticatedRequest } from '../types/auth.types';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  // 注入 Prisma 和令牌服务以校验访问会话。
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  // 校验 Bearer access token 并把当前用户写入请求上下文。
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = this.tokenService.verifyAccessToken(token);
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    const now = new Date();

    if (
      !session ||
      session.userId !== payload.sub ||
      session.status !== AuthSessionStatus.ACTIVE ||
      session.expiresAt <= now ||
      session.user.status !== UserStatus.ACTIVE ||
      !session.user.emailVerifiedAt
    ) {
      throw new UnauthorizedException('Session is not available');
    }

    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });

    request.auth = {
      userId: payload.sub,
      email: payload.email,
      sessionId: payload.sid,
      tokenId: payload.jti,
    };
    request.user = toAuthUserResponse(session.user);

    return true;
  }

  // 从 Authorization 头中提取 Bearer token。
  private extractBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Bearer token is required');
    }

    return token;
  }
}
