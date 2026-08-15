/*
 * @Description: 全局访问令牌守卫，校验会话并生成请求级认证与授权上下文。
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../database/prisma.service';
import { AuthSessionStatus, UserStatus } from '../../../generated/prisma';
import { toAuthUserResponse } from '../auth.mapper';
import { IS_PUBLIC_ROUTE_METADATA_KEY } from '../decorators/public.decorator';
import { AuthorizationService } from '../services/authorization.service';
import { TokenService } from '../services/token.service';
import type {
  AuthenticatedRequest,
  AuthorizationUserRecord,
} from '../types/auth.types';

/** 会话活跃时间写库的最小间隔，避免每个请求产生一次更新。 */
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class AccessTokenGuard implements CanActivate {
  /** 注入认证与实时授权所需服务。 */
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 校验 Bearer access token，并把用户、会话和授权结果写入请求上下文。 */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = this.tokenService.verifyAccessToken(token);
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: {
        user: {
          include: {
            department: true,
            roles: {
              include: {
                role: {
                  include: {
                    perms: {
                      include: {
                        perm: true,
                      },
                    },
                  },
                },
              },
            },
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
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
      throw new UnauthorizedException('登录会话已失效，请重新登录');
    }

    if (
      !session.lastUsedAt ||
      now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS
    ) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { lastUsedAt: now },
      });
    }

    const authorization = this.authorizationService.buildContext(
      this.toAuthorizationUserRecord(session.user),
    );
    const permissions =
      this.authorizationService.getEffectiveSystemPermissionCodes(
        authorization,
      );

    request.auth = {
      userId: payload.sub,
      email: payload.email,
      sessionId: payload.sid,
      tokenId: payload.jti,
    };
    request.authorization = authorization;
    request.user = toAuthUserResponse(session.user, {
      permissions,
      isSuperAdmin: authorization.isSuperAdmin,
    });

    return true;
  }

  /** 从 Authorization 请求头中提取 Bearer token。 */
  private extractBearerToken(authorization?: string): string {
    if (!authorization) {
      throw new UnauthorizedException('请先登录后再访问');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('访问令牌格式不正确');
    }

    return token;
  }

  /** 将 Prisma 用户关系转换为授权服务需要的稳定输入结构。 */
  private toAuthorizationUserRecord(user: {
    id: number;
    deptId: number | null;
    roles: Array<{
      role: {
        code: string;
        perms: Array<{
          scopeType: AuthorizationUserRecord['roleGrants'][number]['scopeType'];
          perm: { code: string };
        }>;
      };
    }>;
    permissions: Array<{
      effect: AuthorizationUserRecord['directGrants'][number]['effect'];
      scopeType: AuthorizationUserRecord['directGrants'][number]['scopeType'];
      expiresAt: Date | null;
      permission: { code: string };
    }>;
  }): AuthorizationUserRecord {
    return {
      id: user.id,
      deptId: user.deptId,
      roleCodes: user.roles.map(({ role }) => role.code),
      roleGrants: user.roles.flatMap(({ role }) =>
        role.perms.map((grant) => ({
          code: grant.perm.code,
          scopeType: grant.scopeType,
        })),
      ),
      directGrants: user.permissions.map((grant) => ({
        code: grant.permission.code,
        effect: grant.effect,
        scopeType: grant.scopeType,
        expiresAt: grant.expiresAt,
      })),
    };
  }
}
