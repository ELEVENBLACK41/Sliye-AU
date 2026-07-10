/**
 * 本文件验证应用启动时只读权限目录检查的通过与阻断行为。
 */
import { Logger } from '@nestjs/common';
import {
  SYSTEM_PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_DEFINITIONS,
  type AccessDataScope,
} from '@workspace/contracts/access';

import type { PrismaService } from '../../database/prisma.service';
import { PermissionKind } from '../../generated/prisma';
import { AccessControlCatalogCheckService } from './access-control-catalog-check.service';

/** 测试数据中系统角色拥有的一条默认授权。 */
type TestRoleGrant = {
  /** 系统权限码。 */
  code: string;
  /** 授权数据范围。 */
  scopeType: AccessDataScope;
};

/** 创建与代码目录完全一致的 Prisma 只读查询替身。 */
function createPrismaMock() {
  return {
    permission: {
      findMany: jest.fn().mockResolvedValue(
        SYSTEM_PERMISSION_DEFINITIONS.map((permission) => ({
          code: permission.code,
          name: permission.name,
          module: permission.module,
          action: permission.action,
          desc: permission.description,
          kind: PermissionKind.SYSTEM,
        })),
      ),
    },
    role: {
      findMany: jest.fn().mockResolvedValue(
        SYSTEM_ROLE_DEFINITIONS.map((role) => {
          const grants = role.permissions as readonly TestRoleGrant[];

          return {
            code: role.code,
            name: role.name,
            desc: role.description,
            isSystem: true,
            perms: grants.map((grant) => ({
              scopeType: grant.scopeType,
              perm: { code: grant.code },
            })),
          };
        }),
      ),
    },
    user: {
      count: jest.fn().mockResolvedValue(1),
    },
  };
}

describe('AccessControlCatalogCheckService', () => {
  /** 避免测试输出正常启动日志。 */
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  /** 恢复 Logger 测试替身。 */
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('数据库与代码目录一致时应允许应用继续启动', async () => {
    const prisma = createPrismaMock();
    const service = new AccessControlCatalogCheckService(
      prisma as unknown as PrismaService,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(prisma.permission.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.role.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.count).toHaveBeenCalledTimes(1);
  });

  it('目录缺失或没有有效超级管理员时应阻止应用启动且不写数据库', async () => {
    const prisma = createPrismaMock();
    prisma.permission.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);
    const service = new AccessControlCatalogCheckService(
      prisma as unknown as PrismaService,
    );

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      '权限目录漂移检查失败',
    );
    expect(Object.keys(prisma.permission)).toEqual(['findMany']);
    expect(Object.keys(prisma.role)).toEqual(['findMany']);
    expect(Object.keys(prisma.user)).toEqual(['count']);
  });
});
