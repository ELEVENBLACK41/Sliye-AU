/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理的 Server Component 数据读取服务
 * @Copyright: Copyright 1990 - 2026
 */
import { cache } from "react"
import { cookies } from "next/headers"

import { AUTH_ACCESS_COOKIE_NAME } from "@/features/auth/constants"
import type {
  AccessPermission,
  AccessRole,
  AccessUser,
} from "@/features/access-management/types/access-management.type"
import {
  requestPermissionsFromNest,
  requestRolesFromNest,
  requestUsersFromNest,
} from "./access-management-bff.service"

export type AccessManagementDashboardData = {
  users: AccessUser[]
  roles: AccessRole[]
  permissions: AccessPermission[]
}

// 在服务端读取用户管理页面需要的完整数据。
export async function getAccessManagementDashboardData(): Promise<AccessManagementDashboardData> {
  const [users, roles, permissions] = await Promise.all([
    getAccessUsers(),
    getAccessRoles(),
    getAccessPermissions(),
  ])

  return {
    users,
    roles,
    permissions,
  }
}

// 读取用户列表，并在单次服务端渲染中复用相同请求结果。
export const getAccessUsers = cache(async (): Promise<AccessUser[]> => {
  const accessToken = await getAccessToken()

  return unwrapResponse(requestUsersFromNest(accessToken), "用户列表加载失败")
})

// 读取角色列表，并在单次服务端渲染中复用相同请求结果。
export const getAccessRoles = cache(async (): Promise<AccessRole[]> => {
  const accessToken = await getAccessToken()

  return unwrapResponse(requestRolesFromNest(accessToken), "角色列表加载失败")
})

// 读取权限码列表，并在单次服务端渲染中复用相同请求结果。
export const getAccessPermissions = cache(
  async (): Promise<AccessPermission[]> => {
    const accessToken = await getAccessToken()

    return unwrapResponse(
      requestPermissionsFromNest(accessToken),
      "权限列表加载失败",
    )
  },
)

// 在服务端读取 httpOnly token，供受保护的管理接口使用。
const getAccessToken = cache(async () => {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value

  if (!accessToken) {
    throw new Error("登录状态已失效，请重新登录")
  }

  return accessToken
})

// 解包 Nest 统一响应，失败时抛出中文错误。
async function unwrapResponse<T>(
  responsePromise: Promise<{
    body: { code: number; message?: string; data: T | null }
    status: number
  }>,
  fallbackMessage: string,
): Promise<T> {
  const response = await responsePromise

  if (response.status < 200 || response.status >= 300) {
    throw new Error(response.body.message || fallbackMessage)
  }

  if (response.body.code !== 200 || response.body.data === null) {
    throw new Error(response.body.message || fallbackMessage)
  }

  return response.body.data
}
