/**
 * 本文件把最终权限码转换为新版组织与权限页面能力。
 */
import { SYSTEM_PERMISSIONS, type SystemPermissionCode } from '@workspace/contracts/access';

import type {
  OrganizationCapabilities,
  OrganizationCapabilityInput,
} from '../types/organization-access.types';

/** 组织与权限一级入口允许使用的全部读取权限。 */
export const ORGANIZATION_ENTRY_PERMISSIONS: SystemPermissionCode[] = [
  SYSTEM_PERMISSIONS.access.user.read,
  SYSTEM_PERMISSIONS.access.department.read,
  SYSTEM_PERMISSIONS.access.role.read,
  SYSTEM_PERMISSIONS.access.permission.read,
  SYSTEM_PERMISSIONS.access.audit.read,
  SYSTEM_PERMISSIONS.project.auditRead,
];

/** 根据认证资料构建细粒度页面能力。 */
export function buildOrganizationCapabilities({
  isSuperAdmin,
  permissions,
}: OrganizationCapabilityInput): OrganizationCapabilities {
  /** 判断当前用户是否拥有指定权限，超级管理员始终通过。 */
  function has(permission: SystemPermissionCode): boolean {
    return isSuperAdmin || permissions.includes(permission);
  }

  return {
    isSuperAdmin,
    canReadUsers: has(SYSTEM_PERMISSIONS.access.user.read),
    canUpdateUserStatus: has(SYSTEM_PERMISSIONS.access.user.statusUpdate),
    canUpdateUserDepartment: has(SYSTEM_PERMISSIONS.access.user.departmentUpdate),
    canAssignUserRole: has(SYSTEM_PERMISSIONS.access.userRole.assign),
    canAssignUserPermission: has(SYSTEM_PERMISSIONS.access.userPermission.assign),
    canReadDepartments: has(SYSTEM_PERMISSIONS.access.department.read),
    canCreateDepartment: has(SYSTEM_PERMISSIONS.access.department.create),
    canUpdateDepartment: has(SYSTEM_PERMISSIONS.access.department.update),
    canMoveDepartment: has(SYSTEM_PERMISSIONS.access.department.move),
    canReadRoles: has(SYSTEM_PERMISSIONS.access.role.read),
    canCreateRole: has(SYSTEM_PERMISSIONS.access.role.create),
    canUpdateRole: has(SYSTEM_PERMISSIONS.access.role.update),
    canAssignRolePermission: has(SYSTEM_PERMISSIONS.access.rolePermission.assign),
    canReadPermissions: has(SYSTEM_PERMISSIONS.access.permission.read),
    canReadAudit: has(SYSTEM_PERMISSIONS.access.audit.read),
    canReadProjectAudit: has(SYSTEM_PERMISSIONS.project.auditRead),
  };
}
