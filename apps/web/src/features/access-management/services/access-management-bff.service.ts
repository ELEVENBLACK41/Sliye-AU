/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理 BFF 服务，封装 Next Route Handler 到 Nest 的请求
 * @Copyright: Copyright 1990 - 2026
 */
import type {
  AccessPermission,
  AccessRole,
  AccessUser,
} from "@/features/access-management/types/access-management.type"
import { requestNest } from "@/services/bff-request"
import type { NestResponse } from "@/services/bff-request"

// 查询用户列表。
export function requestUsersFromNest(
  accessToken: string,
): Promise<NestResponse<AccessUser[]>> {
  return requestNest<AccessUser[]>("/access-management/users", {
    method: "GET",
    headers: createAuthHeaders(accessToken),
  })
}

// 查询角色列表。
export function requestRolesFromNest(
  accessToken: string,
): Promise<NestResponse<AccessRole[]>> {
  return requestNest<AccessRole[]>("/access-management/roles", {
    method: "GET",
    headers: createAuthHeaders(accessToken),
  })
}

// 查询权限列表。
export function requestPermissionsFromNest(
  accessToken: string,
): Promise<NestResponse<AccessPermission[]>> {
  return requestNest<AccessPermission[]>("/access-management/permissions", {
    method: "GET",
    headers: createAuthHeaders(accessToken),
  })
}

// 构造访问 Nest 受保护接口需要的 Authorization header。
function createAuthHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

