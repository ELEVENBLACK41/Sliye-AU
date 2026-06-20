import type { ReactNode } from "react"

import { getCurrentAuthUser } from "@/features/auth/services/auth-server.service"
import { DashboardShell } from "@/features/navigation"

// 为 dashboard 路由组提供统一的侧边栏布局。
export default async function Layout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentAuthUser()

  return (
    <DashboardShell currentUserPermissions={currentUser?.permissions ?? []}>
      {children}
    </DashboardShell>
  )
}
