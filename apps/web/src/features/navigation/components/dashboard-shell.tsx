/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: Dashboard 区域的侧边栏导航外壳，承载主菜单与内容布局
 * @Copyright: Copyright 1990 - 2026
 */
"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ClipboardList,
  GitBranch,
  Home,
  Settings,
  ShieldCheck,
  UsersRound,
} from "lucide-react"
import { ACCESS_MANAGEMENT_PERMISSIONS } from "@workspace/contracts/access"

import { LogoutButton } from "@/features/auth/components/logout-button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

type DashboardShellProps = {
  children: ReactNode
  currentUserPermissions: string[]
}

type DashboardMenuItem = {
  title: string
  href: string
  icon: typeof Home
  permission?: string
}

const dashboardMenus: DashboardMenuItem[] = [
  {
    title: "工作台",
    href: "/dashboard",
    icon: Home,
  },
  {
    title: "决策记录",
    href: "/dashboard/decisions",
    icon: ClipboardList,
  },
  {
    title: "用户管理",
    href: "/dashboard/users",
    icon: ShieldCheck,
    permission: ACCESS_MANAGEMENT_PERMISSIONS.read,
  },
  {
    title: "会议协作",
    href: "/dashboard/meetings",
    icon: UsersRound,
  },
  {
    title: "时间线",
    href: "/dashboard/timeline",
    icon: GitBranch,
  },
  {
    title: "系统设置",
    href: "/dashboard/settings",
    icon: Settings,
  },
]

// 渲染 dashboard 的全局侧边栏布局。
export function DashboardShell({
  children,
  currentUserPermissions,
}: DashboardShellProps) {
  const pathname = usePathname()
  const visibleMenus = dashboardMenus.filter(
    (item) =>
      !item.permission ||
      currentUserPermissions.includes(item.permission),
  )

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">
              Decision Hub
            </span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              决策协作系统
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>主菜单</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMenus.map((item) => {
                  const isActive =
                    item.href === "/dashboard"
                      ? pathname === item.href
                      : pathname.startsWith(item.href)
                  const Icon = item.icon

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <Link href={item.href}>
                          <Icon aria-hidden />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Sliye-AU</p>
              <p className="truncate text-xs text-muted-foreground">
                先把导航和页面骨架搭稳
              </p>
            </div>
          </div>
          <LogoutButton />
        </header>
        <div className="flex flex-1 flex-col bg-zinc-50 p-4 md:p-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
