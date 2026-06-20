/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理的前后端共享类型契约
 * @Copyright: Copyright 1990 - 2026
 */
export type AccessUserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED';

export type AccessPermissionEffect = 'ALLOW' | 'DENY';

export type AccessDataScope =
  | 'ALL'
  | 'OWN'
  | 'DEPT'
  | 'DEPT_AND_CHILD'
  | 'PARTICIPATED'
  | 'CUSTOM';

export type AccessRole = {
  id: number;
  name: string;
  desc: string | null;
  createdAt: string;
  updatedAt: string;
  permissionCount: number;
  userCount: number;
};

export type AccessPermission = {
  id: number;
  code: string;
  name: string | null;
  module: string;
  action: string;
  desc: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccessUserRole = {
  id: number;
  name: string;
  desc: string | null;
  assignedAt: string;
};

export type AccessUserPermission = {
  id: number;
  permission: AccessPermission;
  effect: AccessPermissionEffect;
  scopeType: AccessDataScope | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccessUser = {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  status: AccessUserStatus;
  deptId: number | null;
  departmentName: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: AccessUserRole[];
  directPermissions: AccessUserPermission[];
};

export type CreateRoleRequestPayload = {
  name: string;
  desc?: string;
};

export type UpdateRoleRequestPayload = Partial<CreateRoleRequestPayload>;

export type CreatePermissionRequestPayload = {
  code: string;
  name?: string;
  module: string;
  action: string;
  desc?: string;
};

export type AssignRoleToUserRequestPayload = {
  roleId: number;
};

export type AssignPermissionToRoleRequestPayload = {
  permissionId: number;
};

export type AssignDirectPermissionToUserRequestPayload = {
  permissionId: number;
  effect?: AccessPermissionEffect;
  scopeType?: AccessDataScope;
  expiresAt?: string;
};

