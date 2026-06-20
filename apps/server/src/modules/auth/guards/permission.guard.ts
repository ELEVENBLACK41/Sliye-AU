/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 权限码守卫，基于用户角色权限和用户级直接授权拦截受保护接口
 * @Copyright: Copyright 1990 - 2026
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../database/prisma.service';
import { PermissionEffect } from '../../../generated/prisma';
import type { AuthenticatedRequest } from '../types/auth.types';
import { REQUIRED_PERMISSIONS_METADATA_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  // 注入反射器和 Prisma，用于读取接口声明并计算当前用户权限。
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  // 校验当前用户是否拥有接口声明的全部权限码。
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.auth?.userId;

    if (!userId) {
      throw new ForbiddenException('Permission context is missing');
    }

    const userPermissions = await this.loadEffectivePermissionCodes(userId);
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.has(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Permission denied');
    }

    return true;
  }

  // 读取用户角色权限和用户直接授权，用户级 DENY 优先于角色授权。
  private async loadEffectivePermissionCodes(userId: number) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        roles: {
          select: {
            role: {
              select: {
                perms: {
                  select: {
                    perm: {
                      select: {
                        code: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        permissions: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: {
            effect: true,
            permission: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    const rolePermissionCodes =
      user?.roles.flatMap((userRole) =>
        userRole.role.perms.map((rolePermission) => rolePermission.perm.code),
      ) ?? [];
    const deniedCodes = new Set(
      user?.permissions
        .filter((permission) => permission.effect === PermissionEffect.DENY)
        .map((permission) => permission.permission.code) ?? [],
    );
    const allowedDirectCodes =
      user?.permissions
        .filter((permission) => permission.effect === PermissionEffect.ALLOW)
        .map((permission) => permission.permission.code) ?? [];

    return new Set(
      [...rolePermissionCodes, ...allowedDirectCodes].filter(
        (code) => !deniedCodes.has(code),
      ),
    );
  }
}
