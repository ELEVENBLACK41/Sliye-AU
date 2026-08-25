/**
 * 本文件负责 Agent Runtime 内部工具调用所需的系统权限上下文构造。
 * AI 工具没有浏览器会话，只能拿到已领取 Run 的 Thread 所有者用户主键；
 * 本服务据此现取现算与登录态一致的授权上下文，禁止工具绕过实时鉴权。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { UserStatus } from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type {
  AuthorizationContext,
  AuthorizationUserRecord,
} from '../../auth/types/auth.types';

@Injectable()
export class AiPermissionPolicyService {
  /** 注入数据库和统一授权服务，复用与登录守卫一致的权限合并规则。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /**
   * 为指定用户现取现算请求级授权上下文，供 AI 只读工具调用时鉴权。
   * 用户不存在或状态非 ACTIVE（例如已被禁用/锁定）时拒绝，
   * 避免账号权限被收回后 AI 仍以其身份继续读取业务数据。
   */
  async buildAuthorizationContext(
    userId: number,
  ): Promise<AuthorizationContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        deptId: true,
        status: true,
        roles: {
          select: {
            role: {
              select: {
                code: true,
                perms: {
                  select: {
                    scopeType: true,
                    perm: { select: { code: true } },
                  },
                },
              },
            },
          },
        },
        permissions: {
          select: {
            effect: true,
            scopeType: true,
            expiresAt: true,
            permission: { select: { code: true } },
          },
        },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_PERMISSION_DENIED,
        message: '当前账号不可用，AI 无法继续以该身份查询业务数据',
        status: HttpStatus.FORBIDDEN,
      });
    }

    return this.authorizationService.buildContext(
      this.toAuthorizationUserRecord(user),
    );
  }

  /** 将内部查询结果转换为授权服务需要的稳定输入结构，字段含义与登录守卫保持一致。 */
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
