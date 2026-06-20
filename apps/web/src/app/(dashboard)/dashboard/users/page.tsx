/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户管理页面，展示用户、角色和权限码基础管理视图
 * @Copyright: Copyright 1990 - 2026
 */
import { notFound } from "next/navigation"
import { ACCESS_MANAGEMENT_PERMISSIONS } from "@workspace/contracts/access"

import { getCurrentAuthUser } from "@/features/auth/services/auth-server.service"
import {
  AccessManagementErrorPage,
  AccessManagementPage,
  getAccessManagementDashboardData,
} from "@/features/access-management"

// 渲染用户管理页面。
export default async function UsersPage() {
  const currentUser = await getCurrentAuthUser()

  if (!currentUser?.permissions.includes(ACCESS_MANAGEMENT_PERMISSIONS.read)) {
    notFound()
  }

  const result = await loadAccessManagementData()

  if (!result.ok) {
    return <AccessManagementErrorPage message={result.message} />
  }

  return (
    <AccessManagementPage
      data={result.data}
      currentUserPermissions={currentUser.permissions}
    />
  )
}

// 读取用户管理页面数据，并转换为页面可消费的成功/失败结果。
async function loadAccessManagementData() {
  try {
    const data = await getAccessManagementDashboardData()

    return {
      ok: true as const,
      data,
    }
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error
          ? error.message
          : "用户管理数据加载失败，请稍后再试",
    }
  }
}
