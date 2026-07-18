/**
 * 本文件实现 Dashboard 的响应式导航外壳，并根据认证资料隐藏无权访问的模块。
 */
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, ClipboardList, Home, ShieldCheck } from 'lucide-react';
import { SYSTEM_PERMISSIONS, type SystemPermissionCode } from '@workspace/contracts/access';
import type { AuthUser } from '@workspace/contracts/auth';

import { ThemeToggle } from '@/components/theme-toggle';
import { LogoutButton } from '@/features/auth/components/logout-button';
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
} from '@workspace/ui/components/sidebar';

/** Dashboard 导航外壳的属性。 */
type DashboardShellProps = {
  /** 当前路由页面内容。 */
  children: ReactNode;
  /** 服务端实时读取的当前认证用户。 */
  currentUser: AuthUser;
};

/** 一条受权限控制的 Dashboard 菜单配置。 */
type DashboardMenuItem = {
  /** 菜单中文名称。 */
  title: string;
  /** 菜单目标路由。 */
  href: string;
  /** 菜单图标。 */
  icon: typeof Home;
  /** 展示菜单所需的系统权限码。 */
  permission: SystemPermissionCode;
};

/** 目前已经接入真实功能权限的 Dashboard 菜单。 */
const dashboardMenus: DashboardMenuItem[] = [
  {
    title: '工作台',
    href: '/dashboard',
    icon: Home,
    permission: SYSTEM_PERMISSIONS.dashboard.access,
  },
  {
    title: '决策记录',
    href: '/dashboard/decisions',
    icon: ClipboardList,
    permission: SYSTEM_PERMISSIONS.decision.read,
  },
  {
    title: '权限管理',
    href: '/dashboard/users',
    icon: ShieldCheck,
    permission: SYSTEM_PERMISSIONS.access.user.read,
  },
  {
    title: 'AI 对话',
    href: '/dashboard/ai',
    icon: Bot,
    permission: SYSTEM_PERMISSIONS.ai.chatUse,
  },
];

/** 渲染 Dashboard 的全局侧边栏与内容布局。 */
export function DashboardShell({ children, currentUser }: DashboardShellProps) {
  const pathname = usePathname();
  const visibleMenus = dashboardMenus.filter(
    (item) =>
      currentUser.accessState === 'READY' &&
      (currentUser.isSuperAdmin || currentUser.permissions.includes(item.permission)),
  );

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">Decision Hub</span>
            <span className="truncate text-xs text-sidebar-foreground/70">决策协作系统</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>主菜单</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMenus.map((item) => {
                  const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                        <Link href={item.href}>
                          <Icon aria-hidden />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{currentUser.name || currentUser.email}</p>
              <p className="truncate text-xs text-muted-foreground">{currentUser.department?.name ?? '尚未分配部门'}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <div className="flex flex-1 flex-col bg-muted/40 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
