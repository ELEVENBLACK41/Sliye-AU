/*
 * @Description: 统一授权服务单元测试，覆盖权限优先级与核心数据范围。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import {
  DataScope,
  DepartmentStatus,
  PermissionEffect,
} from '../../../generated/prisma';
import type { PrismaService } from '../../../database/prisma.service';
import type { AuthorizationUserRecord } from '../types/auth.types';
import { AuthorizationService } from './authorization.service';

/** 创建授权服务使用的最小 Prisma mock。 */
function createPrismaMock() {
  return {
    department: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

/** 创建一条可按测试场景覆盖的授权用户记录。 */
function createUserRecord(
  overrides: Partial<AuthorizationUserRecord> = {},
): AuthorizationUserRecord {
  return {
    id: 10,
    deptId: 2,
    roleCodes: ['MEMBER'],
    roleGrants: [],
    directGrants: [],
    ...overrides,
  };
}

describe('AuthorizationService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AuthorizationService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AuthorizationService(prisma as unknown as PrismaService);
  });

  it('用户级全局拒绝应覆盖角色允许和直接允许', () => {
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [{ code: 'decision:read', scopeType: DataScope.DEPT }],
        directGrants: [
          {
            code: 'decision:read',
            effect: PermissionEffect.ALLOW,
            scopeType: DataScope.ALL,
            expiresAt: null,
          },
          {
            code: 'decision:read',
            effect: PermissionEffect.DENY,
            scopeType: DataScope.ALL,
            expiresAt: null,
          },
        ],
      }),
    );

    expect(service.hasPermission(context, 'decision:read')).toBe(false);
    expect(context.deniedPermissions.has('decision:read')).toBe(true);
  });

  it('过期直接拒绝不应影响仍有效的角色授权', () => {
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [
          { code: 'decision:read', scopeType: DataScope.PARTICIPATED },
        ],
        directGrants: [
          {
            code: 'decision:read',
            effect: PermissionEffect.DENY,
            scopeType: DataScope.ALL,
            expiresAt: new Date(Date.now() - 60_000),
          },
        ],
      }),
    );

    expect(service.hasPermission(context, 'decision:read')).toBe(true);
    expect(service.getScopes(context, 'decision:read')).toEqual(
      new Set([DataScope.PARTICIPATED]),
    );
  });

  it('有效的用户直接允许应与角色范围按 OR 合并', () => {
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [{ code: 'decision:read', scopeType: DataScope.DEPT }],
        directGrants: [
          {
            code: 'decision:read',
            effect: PermissionEffect.ALLOW,
            scopeType: DataScope.PARTICIPATED,
            expiresAt: null,
          },
        ],
      }),
    );

    expect(service.hasPermission(context, 'decision:read')).toBe(true);
    expect(service.getScopes(context, 'decision:read')).toEqual(
      new Set([DataScope.DEPT, DataScope.PARTICIPATED]),
    );
  });

  it('过期的用户直接允许不应产生权限', () => {
    const context = service.buildContext(
      createUserRecord({
        directGrants: [
          {
            code: 'decision:read',
            effect: PermissionEffect.ALLOW,
            scopeType: DataScope.ALL,
            expiresAt: new Date(Date.now() - 60_000),
          },
        ],
      }),
    );

    expect(service.hasPermission(context, 'decision:read')).toBe(false);
    expect(service.getScopes(context, 'decision:read')).toEqual(new Set());
  });

  it('超级管理员应旁路系统权限和数据范围', () => {
    const context = service.buildContext(
      createUserRecord({ roleCodes: ['SUPER_ADMIN'] }),
    );

    expect(service.hasPermission(context, 'access:role:update')).toBe(true);
    expect(service.getScopes(context, 'decision:read')).toEqual(
      new Set([DataScope.ALL]),
    );
  });

  it('部门及下级范围应转换为包含后代部门的决策查询', async () => {
    prisma.department.findMany.mockResolvedValue([
      { id: 2, parentId: null },
      { id: 3, parentId: 2 },
      { id: 4, parentId: 3 },
      { id: 9, parentId: null },
    ]);
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [
          {
            code: 'decision:read',
            scopeType: DataScope.DEPT_AND_CHILD,
          },
        ],
      }),
    );

    await expect(
      service.buildDecisionWhere(context, 'decision:read'),
    ).resolves.toEqual({
      OR: [{ deptId: { in: [2, 3, 4] } }],
    });
  });

  it('ALL 范围应生成不附加隔离条件的决策查询', async () => {
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [{ code: 'decision:read', scopeType: DataScope.ALL }],
      }),
    );

    await expect(
      service.buildDecisionWhere(context, 'decision:read'),
    ).resolves.toEqual({});
  });

  it('DEPT 范围只应匹配当前主部门', async () => {
    const context = service.buildContext(
      createUserRecord({
        deptId: 2,
        roleGrants: [{ code: 'decision:read', scopeType: DataScope.DEPT }],
      }),
    );

    await expect(
      service.buildDecisionWhere(context, 'decision:read'),
    ).resolves.toEqual({ OR: [{ deptId: 2 }] });
  });

  it('无部门用户的 DEPT 范围不应匹配任何资源', async () => {
    const context = service.buildContext(
      createUserRecord({
        deptId: null,
        roleGrants: [{ code: 'decision:read', scopeType: DataScope.DEPT }],
      }),
    );

    await expect(
      service.buildDecisionWhere(context, 'decision:read'),
    ).resolves.toEqual({ id: -1 });
    await expect(
      service.buildDepartmentWhere(context, 'access:department:read'),
    ).resolves.toEqual({ id: -1 });
  });

  it('本人和参与范围应按 OR 组合，避免扩大为全部数据', async () => {
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [
          { code: 'decision:read', scopeType: DataScope.OWN },
          { code: 'decision:read', scopeType: DataScope.PARTICIPATED },
        ],
      }),
    );

    await expect(
      service.buildDecisionWhere(context, 'decision:read'),
    ).resolves.toEqual({
      OR: [
        { OR: [{ creatorId: 10 }, { ownerId: 10 }] },
        { participants: { some: { userId: 10 } } },
      ],
    });
  });

  it('普通管理员不能授予超出自身范围的权限', () => {
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [{ code: 'decision:read', scopeType: DataScope.DEPT }],
      }),
    );

    let capturedError: unknown;

    try {
      service.assertCanGrantScope(
        context,
        'decision:read',
        DataScope.DEPT_AND_CHILD,
      );
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(BusinessException);
    expect(capturedError).toMatchObject({
      code: API_ERROR_CODES.ACCESS_GRANT_EXCEEDS_ACTOR,
    });
  });

  it('停用部门不能接收新成员或新决策', async () => {
    prisma.department.findUnique.mockResolvedValue({
      id: 2,
      status: DepartmentStatus.DISABLED,
    });
    const context = service.buildContext(
      createUserRecord({
        roleGrants: [{ code: 'decision:create', scopeType: DataScope.DEPT }],
      }),
    );

    await expect(
      service.assertDepartmentInScope(context, 'decision:create', 2),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DEPARTMENT_DISABLED,
      status: 409,
    });
  });

  it('其他部门即使存在也应被数据范围拒绝', async () => {
    prisma.department.findUnique.mockResolvedValue({
      id: 9,
      status: DepartmentStatus.ACTIVE,
    });
    prisma.department.findFirst.mockResolvedValue(null);
    const context = service.buildContext(
      createUserRecord({
        deptId: 2,
        roleGrants: [{ code: 'decision:create', scopeType: DataScope.DEPT }],
      }),
    );

    await expect(
      service.assertDepartmentInScope(context, 'decision:create', 9),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
      status: 403,
    });
  });
});
