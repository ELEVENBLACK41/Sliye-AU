/**
 * 本文件为新版组织与权限 Server Components 提供独立只读数据服务。
 */
import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
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

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import {
  requestOrganizationAuditFromNest,
  requestOrganizationDepartmentsFromNest,
  requestOrganizationPermissionsFromNest,
  requestOrganizationRolesFromNest,
  requestOrganizationUsersFromNest,
  requestUserAuthorizationFromNest,
} from './organization-access-nest-client';

/** 查询分页成员摘要。 */
export async function getOrganizationUsers(query: AccessUserListQuery): Promise<AccessUserListResult> {
  return unwrap(
    requestOrganizationUsersFromNest(await getAccessToken(), query),
    '成员列表加载失败',
  );
}

/** 查询单个用户最终授权详情。 */
export async function getOrganizationUserAuthorization(
  userId: number,
): Promise<AccessUserAuthorizationDetail> {
  return unwrap(
    requestUserAuthorizationFromNest(await getAccessToken(), userId),
    '用户授权详情加载失败',
  );
}

/** 查询全部角色和角色授权。 */
export const getOrganizationRoles = cache(async (): Promise<AccessRole[]> =>
  unwrap(requestOrganizationRolesFromNest(await getAccessToken()), '角色列表加载失败'),
);

/** 查询只读权限目录。 */
export const getOrganizationPermissions = cache(async (): Promise<AccessPermission[]> =>
  unwrap(requestOrganizationPermissionsFromNest(await getAccessToken()), '权限目录加载失败'),
);

/** 查询当前操作者可见的部门树。 */
export const getOrganizationDepartments = cache(async (): Promise<AccessDepartmentTreeNode[]> =>
  unwrap(requestOrganizationDepartmentsFromNest(await getAccessToken()), '部门树加载失败'),
);

/** 查询分页授权审计。 */
export async function getOrganizationAudit(query: AccessAuditListQuery): Promise<AccessAuditListResult> {
  return unwrap(requestOrganizationAuditFromNest(await getAccessToken(), query), '授权审计加载失败');
}

/** 从 httpOnly Cookie 读取服务端请求使用的访问令牌。 */
const getAccessToken = cache(async (): Promise<string> => {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;
  if (!accessToken) throw new Error('登录状态已失效，请重新登录');
  return accessToken;
});

/** 解包 NestJS 统一响应并保留请求编号。 */
async function unwrap<T>(promise: Promise<NestResponse<T>>, fallback: string): Promise<T> {
  const response = await promise;
  if (response.body.success) return response.body.data;
  const suffix = response.body.requestId ? `（请求编号：${response.body.requestId}）` : '';
  throw new Error(`${response.body.message || fallback}${suffix}`);
}
