import type { ReactNode } from "react"

import { DashboardShell } from "@/features/navigation"

// 为 dashboard 路由组提供统一的侧边栏布局。
export default function Layout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
