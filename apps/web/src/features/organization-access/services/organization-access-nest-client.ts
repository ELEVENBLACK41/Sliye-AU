/**
 * 本文件封装新版组织与权限模块在 Next.js 服务端调用 NestJS 的只读请求。
 */
import type {
  AccessAuditListQuery,
  AccessAuditListResult,
  AccessDepartmentTreeNode,
  AccessPermission,
  AccessRole,
  AccessUserAuthorizationDetail,
  AccessUserListQuery,
  AccessUserListResult,
} from '@workspace/contracts/access';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询服务端分页成员列表。 */
export function requestOrganizationUsersFromNest(
  accessToken: string,
  query: AccessUserListQuery,
): Promise<NestResponse<AccessUserListResult>> {
  return requestNest<AccessUserListResult>(`/access-management/users${createQueryString(query)}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询单个成员的完整授权解析。 */
export function requestUserAuthorizationFromNest(
  accessToken: string,
  userId: number,
): Promise<NestResponse<AccessUserAuthorizationDetail>> {
  return requestNest<AccessUserAuthorizationDetail>(`/access-management/users/${userId}/authorization`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询角色及其权限范围。 */
export function requestOrganizationRolesFromNest(accessToken: string): Promise<NestResponse<AccessRole[]>> {
  return requestNest<AccessRole[]>('/access-management/roles', { headers: createAuthHeaders(accessToken) });
}

/** 查询只读权限目录。 */
export function requestOrganizationPermissionsFromNest(
  accessToken: string,
): Promise<NestResponse<AccessPermission[]>> {
  return requestNest<AccessPermission[]>('/access-management/permissions', {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询当前操作者可见的部门树。 */
export function requestOrganizationDepartmentsFromNest(
  accessToken: string,
): Promise<NestResponse<AccessDepartmentTreeNode[]>> {
  return requestNest<AccessDepartmentTreeNode[]>('/access-management/departments', {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询分页访问控制审计。 */
export function requestOrganizationAuditFromNest(
  accessToken: string,
  query: AccessAuditListQuery,
): Promise<NestResponse<AccessAuditListResult>> {
  return requestNest<AccessAuditListResult>(`/access-management/audit-logs${createQueryString(query)}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造 Bearer 认证请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}

/** 将只包含标量值的查询对象转换为 URL 查询字符串。 */
function createQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : '';
}
