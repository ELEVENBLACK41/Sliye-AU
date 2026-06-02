'use client';

/*
 * @Description: 这个文件负责渲染 admin 后台的主侧边栏导航。
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Settings, ShieldCheck, Users, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@workspace/ui/components/sidebar';

type AdminNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

const navItems: AdminNavItem[] = [
  {
    title: '概览',
    href: '/',
    icon: LayoutDashboard,
  },
  {
    title: '用户',
    href: '/users',
    icon: Users,
  },
  {
    title: '决策',
    href: '/dec',
    icon: Workflow,
  },
  {
    title: '角色',
    href: '/roles',
    icon: ShieldCheck,
  },
  {
    title: '设置',
    href: '/settings',
    icon: Settings,
  },
];

/** 判断当前路由是否匹配侧边栏导航项。 */
function isActivePath(pathname: string, href: string) {
  if (href === '/') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 渲染 admin 平台的主导航侧栏。 */
function AdminSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Sliye 管理后台">
              <Link href="/" onClick={() => setOpenMobile(false)}>
                <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
                  AU
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Sliye 管理后台</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">平台控制台</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>平台</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActivePath(pathname, item.href)} tooltip={item.title}>
                    <Link href={item.href} onClick={() => setOpenMobile(false)}>
                      <item.icon aria-hidden />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 group-data-[collapsible=icon]:hidden">
          <p className="text-xs font-medium">Admin v1</p>
          <p className="mt-1 text-xs text-sidebar-foreground/60">静态预览页面</p>
        </div>
      </SidebarFooter>
      <SidebarRail className="hover:after:bg-sidebar-primary/60" />
    </Sidebar>
  );
}

export { AdminSidebar };
