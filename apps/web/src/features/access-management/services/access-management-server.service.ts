/**
 * 本文件封装权限管理 Server Component 所需的只读数据请求，并统一解包 NestJS 响应。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type {
  AccessAuditListResult,
  AccessDepartmentTreeNode,
  AccessPermission,
  AccessRole,
  AccessUser,
} from '@workspace/contracts/access';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import {
  requestAuditLogsFromNest,
  requestDepartmentsFromNest,
  requestPermissionsFromNest,
  requestRolesFromNest,
  requestUsersFromNest,
} from './access-management-nest-client';

/** 权限管理完整看板的数据集合。 */
export type AccessManagementDashboardData = {
  /** 当前操作者数据范围内可见的用户。 */
  users: AccessUser[];
  /** 当前可查看的角色与范围授权。 */
  roles: AccessRole[];
  /** 系统、历史和自定义权限目录。 */
  permissions: AccessPermission[];
  /** 当前操作者数据范围内可见的部门树。 */
  departments: AccessDepartmentTreeNode[];
  /** 最近的访问控制配置变更审计。 */
  auditLogs: AccessAuditListResult;
};

/** 并发读取权限管理完整看板数据，适用于拥有全部读取权限的管理员。 */
export async function getAccessManagementDashboardData(): Promise<AccessManagementDashboardData> {
  const [users, roles, permissions, departments, auditLogs] = await Promise.all([
    getAccessUsers(),
    getAccessRoles(),
    getAccessPermissions(),
    getAccessDepartments(),
    getAccessAuditLogs(),
  ]);

  return { users, roles, permissions, departments, auditLogs };
}

/** 读取当前操作者数据范围内的用户列表，并在一次服务端渲染中复用结果。 */
export const getAccessUsers = cache(async (): Promise<AccessUser[]> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(requestUsersFromNest(accessToken), '用户列表加载失败');
});

/** 读取角色列表与每条角色授权的数据范围。 */
export const getAccessRoles = cache(async (): Promise<AccessRole[]> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(requestRolesFromNest(accessToken), '角色列表加载失败');
});

/** 读取只读权限目录。 */
export const getAccessPermissions = cache(async (): Promise<AccessPermission[]> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(requestPermissionsFromNest(accessToken), '权限目录加载失败');
});

/** 读取当前操作者数据范围内的部门树。 */
export const getAccessDepartments = cache(async (): Promise<AccessDepartmentTreeNode[]> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(requestDepartmentsFromNest(accessToken), '部门树加载失败');
});

/** 读取最近的访问控制配置变更审计。 */
export const getAccessAuditLogs = cache(async (): Promise<AccessAuditListResult> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(requestAuditLogsFromNest(accessToken), '授权审计加载失败');
});

/** 从 httpOnly Cookie 中读取供服务端 BFF 请求使用的访问令牌。 */
const getAccessToken = cache(async (): Promise<string> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;

  if (!accessToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  return accessToken;
});

/** 解包 NestJS 可判别响应，并把服务端中文错误和 requestId 带入页面错误提示。 */
async function unwrapResponse<T>(responsePromise: Promise<NestResponse<T>>, fallbackMessage: string): Promise<T> {
  const response = await responsePromise;

  if (!response.body.success) {
    const requestSuffix = response.body.requestId ? `（请求编号：${response.body.requestId}）` : '';
    throw new Error(`${response.body.message || fallbackMessage}${requestSuffix}`);
  }

  return response.body.data;
}
