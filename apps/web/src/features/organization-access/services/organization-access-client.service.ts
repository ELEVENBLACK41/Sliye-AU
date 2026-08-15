/**
 * 本文件封装新版组织与权限浏览器端读写请求，不依赖旧权限管理 feature。
 */
import type {
  AccessUserAuthorizationDetail,
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
import type { ProjectAuditReadRequestPayload, ProjectAuditReadResponse } from '@workspace/contracts/projects';

import { requestData } from '@/services/request';

/** 通过独立审计入口只读查看指定私有项目内容。 */
export function readOrganizationPrivateProject(
  payload: ProjectAuditReadRequestPayload,
): Promise<ProjectAuditReadResponse> {
  return requestData('/api/access-management/project-audits/private-content', {
    method: 'POST',
    body: payload,
    errorMessage: '私有项目内容审计读取失败',
  });
}

/** 在抽屉打开后按需读取用户最终授权。 */
export function getOrganizationUserAuthorizationClient(userId: number): Promise<AccessUserAuthorizationDetail> {
  return requestData(`/api/access-management/users/${userId}/authorization`, {
    errorMessage: '用户授权详情加载失败',
  });
}

/** 创建部门。 */
export function createOrganizationDepartment(payload: CreateDepartmentRequestPayload): Promise<void> {
  return mutate('/api/access-management/departments', 'POST', payload);
}

/** 更新部门资料。 */
export function updateOrganizationDepartment(id: number, payload: UpdateDepartmentRequestPayload): Promise<void> {
  return mutate(`/api/access-management/departments/${id}`, 'PATCH', payload);
}

/** 移动部门。 */
export function moveOrganizationDepartment(id: number, payload: MoveDepartmentRequestPayload): Promise<void> {
  return mutate(`/api/access-management/departments/${id}/move`, 'PATCH', payload);
}

/** 更新部门启停状态。 */
export function updateOrganizationDepartmentStatus(
  id: number,
  payload: UpdateDepartmentStatusRequestPayload,
): Promise<void> {
  return mutate(`/api/access-management/departments/${id}/status`, 'PATCH', payload);
}

/** 更新用户主部门。 */
export function updateOrganizationUserDepartment(
  id: number,
  payload: UpdateUserDepartmentRequestPayload,
): Promise<void> {
  return mutate(`/api/access-management/users/${id}/department`, 'PATCH', payload);
}

/** 更新用户状态。 */
export function updateOrganizationUserStatus(
  id: number,
  payload: UpdateAccessUserStatusRequestPayload,
): Promise<void> {
  return mutate(`/api/access-management/users/${id}/status`, 'PATCH', payload);
}

/** 为用户绑定角色。 */
export function assignOrganizationUserRole(id: number, payload: AssignRoleToUserRequestPayload): Promise<void> {
  return mutate(`/api/access-management/users/${id}/roles`, 'POST', payload);
}

/** 解除用户角色。 */
export function removeOrganizationUserRole(id: number, roleId: number): Promise<void> {
  return mutate(`/api/access-management/users/${id}/roles/${roleId}`, 'DELETE');
}

/** 为用户添加直接允许或拒绝。 */
export function assignOrganizationDirectPermission(
  id: number,
  payload: AssignDirectPermissionToUserRequestPayload,
): Promise<void> {
  return mutate(`/api/access-management/users/${id}/permissions`, 'POST', payload);
}

/** 删除用户直接权限。 */
export function removeOrganizationDirectPermission(id: number, grantId: number): Promise<void> {
  return mutate(`/api/access-management/users/${id}/permissions/${grantId}`, 'DELETE');
}

/** 创建自定义角色。 */
export function createOrganizationRole(payload: CreateRoleRequestPayload): Promise<void> {
  return mutate('/api/access-management/roles', 'POST', payload);
}

/** 更新自定义角色。 */
export function updateOrganizationRole(id: number, payload: UpdateRoleRequestPayload): Promise<void> {
  return mutate(`/api/access-management/roles/${id}`, 'PATCH', payload);
}

/** 删除自定义角色。 */
export function deleteOrganizationRole(id: number): Promise<void> {
  return mutate(`/api/access-management/roles/${id}`, 'DELETE');
}

/** 为角色增加权限范围。 */
export function assignOrganizationRolePermission(
  id: number,
  payload: AssignPermissionToRoleRequestPayload,
): Promise<void> {
  return mutate(`/api/access-management/roles/${id}/permissions`, 'POST', payload);
}

/** 删除角色权限范围记录。 */
export function removeOrganizationRolePermission(id: number, grantId: number): Promise<void> {
  return mutate(`/api/access-management/roles/${id}/permissions/${grantId}`, 'DELETE');
}

/** 调用访问控制 BFF 并统一处理无返回值写操作。 */
async function mutate<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: T): Promise<void> {
  await requestData<unknown, T>(url, { method, body, errorMessage: '组织与权限操作失败，请稍后重试' });
}
