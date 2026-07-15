/**
 * 本文件封装浏览器端权限管理写操作，并复用前后端共享请求契约。
 */
import type {
  AssignDirectPermissionToUserRequestPayload,
  AssignPermissionToRoleRequestPayload,
  AssignRoleToUserRequestPayload,
  CreateDepartmentRequestPayload,
  CreateRoleRequestPayload,
  MoveDepartmentRequestPayload,
  UpdateAccessUserStatusRequestPayload,
  UpdateDepartmentRequestPayload,
  UpdateDepartmentStatusRequestPayload,
  UpdateRoleRequestPayload,
  UpdateUserDepartmentRequestPayload,
} from '@workspace/contracts/access';

import { requestData } from '@/services/request';

/** 创建一个部门。 */
export function createDepartment(payload: CreateDepartmentRequestPayload): Promise<void> {
  return mutate('/api/access-management/departments', 'POST', payload);
}

/** 更新指定部门的基本资料。 */
export function updateDepartment(departmentId: number, payload: UpdateDepartmentRequestPayload): Promise<void> {
  return mutate(`/api/access-management/departments/${departmentId}`, 'PATCH', payload);
}

/** 移动指定部门到新的父部门下。 */
export function moveDepartment(departmentId: number, payload: MoveDepartmentRequestPayload): Promise<void> {
  return mutate(`/api/access-management/departments/${departmentId}/move`, 'PATCH', payload);
}

/** 更新指定部门的启停状态。 */
export function updateDepartmentStatus(
  departmentId: number,
  payload: UpdateDepartmentStatusRequestPayload,
): Promise<void> {
  return mutate(`/api/access-management/departments/${departmentId}/status`, 'PATCH', payload);
}

/** 更新指定用户的主部门。 */
export function updateUserDepartment(userId: number, payload: UpdateUserDepartmentRequestPayload): Promise<void> {
  return mutate(`/api/access-management/users/${userId}/department`, 'PATCH', payload);
}

/** 更新指定用户的账号状态。 */
export function updateAccessUserStatus(userId: number, payload: UpdateAccessUserStatusRequestPayload): Promise<void> {
  return mutate(`/api/access-management/users/${userId}/status`, 'PATCH', payload);
}

/** 为指定用户绑定角色。 */
export function assignRoleToUser(userId: number, payload: AssignRoleToUserRequestPayload): Promise<void> {
  return mutate(`/api/access-management/users/${userId}/roles`, 'POST', payload);
}

/** 从指定用户解绑角色。 */
export function removeRoleFromUser(userId: number, roleId: number): Promise<void> {
  return mutate(`/api/access-management/users/${userId}/roles/${roleId}`, 'DELETE');
}

/** 创建一个自定义角色。 */
export function createRole(payload: CreateRoleRequestPayload): Promise<void> {
  return mutate('/api/access-management/roles', 'POST', payload);
}

/** 更新指定自定义角色的资料。 */
export function updateRole(roleId: number, payload: UpdateRoleRequestPayload): Promise<void> {
  return mutate(`/api/access-management/roles/${roleId}`, 'PATCH', payload);
}

/** 删除指定自定义角色。 */
export function deleteRole(roleId: number): Promise<void> {
  return mutate(`/api/access-management/roles/${roleId}`, 'DELETE');
}

/** 为指定角色添加一条带数据范围的授权。 */
export function assignPermissionToRole(roleId: number, payload: AssignPermissionToRoleRequestPayload): Promise<void> {
  return mutate(`/api/access-management/roles/${roleId}/permissions`, 'POST', payload);
}

/** 删除指定角色的一条权限授权记录。 */
export function removePermissionFromRole(roleId: number, grantId: number): Promise<void> {
  return mutate(`/api/access-management/roles/${roleId}/permissions/${grantId}`, 'DELETE');
}

/** 为指定用户添加一条直接允许或拒绝授权。 */
export function assignDirectPermissionToUser(
  userId: number,
  payload: AssignDirectPermissionToUserRequestPayload,
): Promise<void> {
  return mutate(`/api/access-management/users/${userId}/permissions`, 'POST', payload);
}

/** 删除指定用户的一条直接授权记录。 */
export function removeDirectPermissionFromUser(userId: number, grantId: number): Promise<void> {
  return mutate(`/api/access-management/users/${userId}/permissions/${grantId}`, 'DELETE');
}

/** 调用权限管理 BFF，并统一处理无业务返回值的成功响应。 */
async function mutate<TBody>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: TBody): Promise<void> {
  await requestData<unknown, TBody>(url, {
    method,
    body,
    errorMessage: '权限配置操作失败，请稍后重试',
  });
}
