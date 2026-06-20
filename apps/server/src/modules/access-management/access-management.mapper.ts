/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限实体到共享契约响应结构的映射函数
 * @Copyright: Copyright 1990 - 2026
 */
import type {
  AccessPermission,
  AccessRole,
  AccessUser,
} from '@workspace/contracts/access';
import type {
  Department,
  Permission,
  Role,
  User,
  UserPermission,
} from '../../generated/prisma';

type RoleWithCounts = Role & {
  _count: {
    users: number;
    perms: number;
  };
};

type UserRoleRecord = {
  assignedAt: Date;
  role: Role;
};

type UserPermissionRecord = UserPermission & {
  permission: Permission;
};

type UserWithAccessRelations = User & {
  department: Pick<Department, 'name'> | null;
  roles: UserRoleRecord[];
  permissions: UserPermissionRecord[];
};

// 将 Role 实体映射成对外角色响应。
export function toAccessRole(role: RoleWithCounts): AccessRole {
  return {
    id: role.id,
    name: role.name,
    desc: role.desc,
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString(),
    permissionCount: role._count.perms,
    userCount: role._count.users,
  };
}

// 将 Permission 实体映射成对外权限响应。
export function toAccessPermission(permission: Permission): AccessPermission {
  return {
    id: permission.id,
    code: permission.code,
    name: permission.name,
    module: permission.module,
    action: permission.action,
    desc: permission.desc,
    createdAt: permission.createdAt.toISOString(),
    updatedAt: permission.updatedAt.toISOString(),
  };
}

// 将 User 及其访问控制关系映射成用户管理响应。
export function toAccessUser(user: UserWithAccessRelations): AccessUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    deptId: user.deptId,
    departmentName: user.department?.name ?? null,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    roles: user.roles.map((userRole) => ({
      id: userRole.role.id,
      name: userRole.role.name,
      desc: userRole.role.desc,
      assignedAt: userRole.assignedAt.toISOString(),
    })),
    directPermissions: user.permissions.map((userPermission) => ({
      id: userPermission.id,
      permission: toAccessPermission(userPermission.permission),
      effect: userPermission.effect,
      scopeType: userPermission.scopeType,
      expiresAt: userPermission.expiresAt?.toISOString() ?? null,
      createdAt: userPermission.createdAt.toISOString(),
      updatedAt: userPermission.updatedAt.toISOString(),
    })),
  };
}
