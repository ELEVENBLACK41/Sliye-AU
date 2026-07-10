/*
 * @Description: 访问控制管理服务关键安全不变量单元测试。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../database/prisma.service';
import {
  DataScope,
  DepartmentStatus,
  PermissionKind,
  UserStatus,
} from '../../generated/prisma';
import type { AuthorizationService } from '../auth/services/authorization.service';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AccessManagementService } from './access-management.service';

/** 创建超级管理员之外的测试授权上下文。 */
function createActor(): AuthorizationContext {
  return {
    userId: 1,
    deptId: 10,
    isSuperAdmin: false,
    roleCodes: new Set(['ADMIN']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

/** 创建访问控制服务所需的 Prisma 最小 mock。 */
function createPrismaMock() {
  return {
    role: { findUnique: jest.fn() },
    department: { findFirst: jest.fn() },
    user: { findFirst: jest.fn(), count: jest.fn() },
    userRole: { findFirst: jest.fn() },
    permission: { findUnique: jest.fn() },
  };
}

/** 创建访问控制服务所需的授权服务最小 mock。 */
function createAuthorizationMock() {
  return {
    buildDepartmentWhere: jest.fn().mockResolvedValue({}),
    buildUserWhere: jest.fn().mockResolvedValue({}),
    getDepartmentTreeIds: jest.fn(),
    assertDepartmentInScope: jest.fn().mockResolvedValue(undefined),
    assertCanGrantScope: jest.fn(),
  };
}

describe('AccessManagementService', () => {
  it('系统角色不能通过普通更新接口修改', async () => {
    const prisma = createPrismaMock();
    const authorization = createAuthorizationMock();
    prisma.role.findUnique.mockResolvedValue({
      id: 1,
      code: 'ADMIN',
      name: '管理员',
      desc: null,
      isSystem: true,
    });
    const service = new AccessManagementService(
      prisma as unknown as PrismaService,
      authorization as unknown as AuthorizationService,
    );

    await expect(
      service.updateRole(createActor(), 1, { name: '被篡改的管理员' }, {}),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_SYSTEM_ROLE_PROTECTED,
    });
  });

  it('部门不能移动到自己的下级部门', async () => {
    const prisma = createPrismaMock();
    const authorization = createAuthorizationMock();
    prisma.department.findFirst.mockResolvedValue({
      id: 10,
      code: 'root',
      name: '根部门',
      parentId: null,
      status: DepartmentStatus.ACTIVE,
      sortOrder: 0,
    });
    authorization.getDepartmentTreeIds.mockResolvedValue([10, 11]);
    const service = new AccessManagementService(
      prisma as unknown as PrismaService,
      authorization as unknown as AuthorizationService,
    );

    await expect(
      service.moveDepartment(createActor(), 10, { parentId: 11 }, {}),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DEPARTMENT_CYCLE_DETECTED,
    });
  });

  it('不能停用系统内最后一个有效超级管理员', async () => {
    const prisma = createPrismaMock();
    const authorization = createAuthorizationMock();
    prisma.user.findFirst.mockResolvedValue({
      id: 8,
      deptId: 10,
      status: UserStatus.ACTIVE,
      roles: [],
      permissions: [],
      department: null,
    });
    prisma.userRole.findFirst.mockResolvedValue({ userId: 8 });
    prisma.user.count.mockResolvedValue(1);
    const service = new AccessManagementService(
      prisma as unknown as PrismaService,
      authorization as unknown as AuthorizationService,
    );

    await expect(
      service.updateUserStatus(createActor(), 8, { status: 'DISABLED' }, {}),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_LAST_SUPER_ADMIN_REQUIRED,
    });
  });

  it('普通管理员不能调整超级管理员的账号状态', async () => {
    const prisma = createPrismaMock();
    const authorization = createAuthorizationMock();
    prisma.user.findFirst.mockResolvedValue({
      id: 8,
      deptId: 10,
      status: UserStatus.ACTIVE,
      roles: [{ role: { code: 'SUPER_ADMIN' } }],
      permissions: [],
      department: null,
    });
    const service = new AccessManagementService(
      prisma as unknown as PrismaService,
      authorization as unknown as AuthorizationService,
    );

    await expect(
      service.updateUserStatus(createActor(), 8, { status: 'DISABLED' }, {}),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_SYSTEM_ROLE_PROTECTED,
    });
  });

  it('用户级拒绝授权只能使用 ALL 范围', async () => {
    const prisma = createPrismaMock();
    const authorization = createAuthorizationMock();
    prisma.user.findFirst.mockResolvedValue({
      id: 9,
      deptId: 10,
      status: UserStatus.ACTIVE,
      roles: [],
      permissions: [],
      department: null,
    });
    prisma.userRole.findFirst.mockResolvedValue(null);
    prisma.permission.findUnique.mockResolvedValue({
      id: 20,
      code: 'decision:read',
      kind: PermissionKind.SYSTEM,
    });
    const service = new AccessManagementService(
      prisma as unknown as PrismaService,
      authorization as unknown as AuthorizationService,
    );

    await expect(
      service.assignDirectPermissionToUser(
        createActor(),
        9,
        {
          permissionId: 20,
          effect: 'DENY',
          scopeType: DataScope.DEPT,
        },
        {},
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
    });
  });
});
