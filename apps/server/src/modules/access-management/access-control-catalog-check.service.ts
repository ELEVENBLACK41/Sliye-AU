/**
 * 本文件在应用启动阶段只读检查系统权限、系统角色和超级管理员是否与代码目录一致。
 * 检查过程绝不写数据库；发现漂移时停止启动，要求部署流程显式执行同步命令。
 */
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_DEFINITIONS,
  type AccessDataScope,
} from '@workspace/contracts/access';

import { PrismaService } from '../../database/prisma.service';
import { PermissionKind, UserStatus } from '../../generated/prisma';

/** 启动期权限目录检查结果。 */
type CatalogCheckResult = {
  /** 检查发现的全部漂移说明；空数组表示通过。 */
  issues: string[];
};

/** 启动检查比较系统角色时使用的权限范围定义。 */
type CatalogRoleGrant = {
  /** 系统权限码。 */
  code: string;
  /** 该角色默认拥有的数据范围。 */
  scopeType: AccessDataScope;
};

/** 系统角色授权比较使用的稳定键。 */
function createGrantKey(code: string, scopeType: AccessDataScope): string {
  return `${code}\u0000${scopeType}`;
}

/**
 * 应用启动阶段的只读权限目录漂移检查服务。
 *
 * 发现数据库与代码目录不一致时中止启动，避免系统带着不完整或被篡改的默认授权继续运行。
 */
@Injectable()
export class AccessControlCatalogCheckService implements OnApplicationBootstrap {
  /** 启动检查日志记录器。 */
  private readonly logger = new Logger(AccessControlCatalogCheckService.name);

  /** 注入 Prisma，只执行只读目录查询。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 应用完成模块初始化后检查目录漂移，失败时阻止应用带着错误授权启动。 */
  async onApplicationBootstrap(): Promise<void> {
    const result = await this.checkCatalog();

    if (result.issues.length > 0) {
      const details = result.issues
        .map((issue, index) => `${index + 1}. ${issue}`)
        .join('；');
      throw new Error(
        `权限目录漂移检查失败：${details}。请先显式执行 pnpm access-control:sync。`,
      );
    }

    this.logger.log('权限目录启动检查通过，数据库与代码目录一致');
  }

  /** 汇总系统权限、系统角色默认授权和有效超级管理员检查结果。 */
  private async checkCatalog(): Promise<CatalogCheckResult> {
    const issues: string[] = [];

    await Promise.all([
      this.checkPermissions(issues),
      this.checkRoles(issues),
      this.checkEffectiveSuperAdmin(issues),
    ]);

    return { issues };
  }

  /** 比较数据库系统权限元数据，并拒绝目录外记录继续标记为 SYSTEM。 */
  private async checkPermissions(issues: string[]): Promise<void> {
    const permissions = await this.prisma.permission.findMany({
      where: { kind: PermissionKind.SYSTEM },
      select: {
        code: true,
        name: true,
        module: true,
        action: true,
        desc: true,
        kind: true,
      },
    });
    const storedByCode = new Map(
      permissions.map((permission) => [permission.code, permission]),
    );
    const desiredCodes = new Set<string>(
      SYSTEM_PERMISSION_DEFINITIONS.map((permission) => permission.code),
    );

    for (const definition of SYSTEM_PERMISSION_DEFINITIONS) {
      const stored = storedByCode.get(definition.code);

      if (!stored) {
        issues.push(`缺少系统权限 ${definition.code}`);
        continue;
      }

      if (
        stored.name !== definition.name ||
        stored.module !== definition.module ||
        stored.action !== definition.action ||
        stored.desc !== definition.description ||
        stored.kind !== PermissionKind.SYSTEM
      ) {
        issues.push(`系统权限 ${definition.code} 元数据不一致`);
      }
    }

    for (const permission of permissions) {
      if (!desiredCodes.has(permission.code)) {
        issues.push(`目录外权限 ${permission.code} 仍被标记为 SYSTEM`);
      }
    }
  }

  /** 比较四个系统角色的中文资料和全部默认范围授权。 */
  private async checkRoles(issues: string[]): Promise<void> {
    const roles = await this.prisma.role.findMany({
      where: { code: { in: SYSTEM_ROLE_DEFINITIONS.map((role) => role.code) } },
      include: { perms: { include: { perm: { select: { code: true } } } } },
    });
    const storedByCode = new Map(roles.map((role) => [role.code, role]));

    for (const definition of SYSTEM_ROLE_DEFINITIONS) {
      const stored = storedByCode.get(definition.code);

      if (!stored) {
        issues.push(`缺少系统角色 ${definition.code}`);
        continue;
      }

      if (
        stored.name !== definition.name ||
        stored.desc !== definition.description ||
        !stored.isSystem
      ) {
        issues.push(`系统角色 ${definition.code} 元数据不一致`);
      }

      const definitionGrants =
        definition.permissions as readonly CatalogRoleGrant[];
      const desiredGrants = new Set(
        definitionGrants.map((grant) =>
          createGrantKey(grant.code, grant.scopeType),
        ),
      );
      const storedGrants = new Set(
        stored.perms.map((grant) =>
          createGrantKey(grant.perm.code, grant.scopeType),
        ),
      );
      const grantsMatch =
        desiredGrants.size === storedGrants.size &&
        [...desiredGrants].every((grant) => storedGrants.has(grant));

      if (!grantsMatch) {
        issues.push(`系统角色 ${definition.code} 默认授权不一致`);
      }
    }
  }

  /** 确认系统中至少保留一个状态为 ACTIVE 的超级管理员。 */
  private async checkEffectiveSuperAdmin(issues: string[]): Promise<void> {
    const count = await this.prisma.user.count({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: { code: 'SUPER_ADMIN' } } },
      },
    });

    if (count < 1) {
      issues.push('系统中没有有效超级管理员');
    }
  }
}
