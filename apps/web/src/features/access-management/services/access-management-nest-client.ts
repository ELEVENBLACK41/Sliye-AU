/**
 * 本文件封装访问控制管理模块在 Next.js 服务端调用 NestJS 的类型化只读请求。
 */

import type {
  AccessAuditListResult,
  AccessDepartmentTreeNode,
  AccessPermission,
  AccessRole,
  AccessUser,
} from '@workspace/contracts/access';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询当前操作者数据范围内的用户列表。 */
export function requestUsersFromNest(accessToken: string): Promise<NestResponse<AccessUser[]>> {
  return requestNest<AccessUser[]>('/access-management/users', {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询角色及其带数据范围的授权记录。 */
export function requestRolesFromNest(accessToken: string): Promise<NestResponse<AccessRole[]>> {
  return requestNest<AccessRole[]>('/access-management/roles', {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询系统、遗留和自定义权限目录。 */
export function requestPermissionsFromNest(accessToken: string): Promise<NestResponse<AccessPermission[]>> {
  return requestNest<AccessPermission[]>('/access-management/permissions', {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询当前操作者数据范围内的部门树。 */
export function requestDepartmentsFromNest(accessToken: string): Promise<NestResponse<AccessDepartmentTreeNode[]>> {
  return requestNest<AccessDepartmentTreeNode[]>('/access-management/departments', {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询最近的访问控制配置变更审计。 */
export function requestAuditLogsFromNest(accessToken: string): Promise<NestResponse<AccessAuditListResult>> {
  return requestNest<AccessAuditListResult>('/access-management/audit-logs', {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造访问 NestJS 受保护接口需要的认证请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}
