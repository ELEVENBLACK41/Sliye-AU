/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户管理页面，负责权限判断并交给页面组件流式渲染管理数据
 * @Copyright: Copyright 1990 - 2026
 */
import { notFound } from "next/navigation"
import { ACCESS_MANAGEMENT_PERMISSIONS } from "@workspace/contracts/access"

import { AccessManagementPage } from "@/features/access-management"
import { getCurrentAuthUser } from "@/features/auth/services/auth-server.service"

// 渲染用户管理页面入口，只等待当前用户权限，不阻塞业务数据区块流式渲染。
export default async function UsersPage() {
  const currentUser = await getCurrentAuthUser()

  if (!currentUser?.permissions.includes(ACCESS_MANAGEMENT_PERMISSIONS.read)) {
    notFound()
  }

  return (
    <AccessManagementPage currentUserPermissions={currentUser.permissions} />
  )
}
