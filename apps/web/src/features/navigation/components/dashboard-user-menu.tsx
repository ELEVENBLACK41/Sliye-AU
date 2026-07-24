/**
 * 本文件实现 Dashboard 侧边栏底部的当前用户个人信息入口。
 */
import Link from 'next/link';
import type { AuthUser } from '@workspace/contracts/auth';

import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@workspace/ui/components/sidebar';

/** 侧边栏当前用户入口属性。 */
type DashboardUserMenuProps = {
  /** 服务端实时读取的当前认证用户。 */
  currentUser: AuthUser;
  /** 当前是否位于个人信息页面。 */
  isActive: boolean;
};

/** 渲染头像、名称和邮箱组成的侧边栏底部个人信息入口。 */
export function DashboardUserMenu({ currentUser, isActive }: DashboardUserMenuProps) {
  const displayName = currentUser.name || currentUser.email;

  return (
    <SidebarFooter className="border-t border-sidebar-border">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild size="lg" isActive={isActive} tooltip="个人信息">
            <Link href="/dashboard/profile">
              <Avatar className="size-8 rounded-lg">
                <AvatarImage src={currentUser.avatarUrl ?? undefined} alt={`${displayName}的头像`} />
                <AvatarFallback className="rounded-lg">{getUserInitial(currentUser)}</AvatarFallback>
              </Avatar>
              <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-sidebar-foreground/70">{currentUser.email}</span>
              </span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

/** 获取头像占位使用的名称首字符。 */
function getUserInitial(user: AuthUser): string {
  return (user.name || user.email).trim().charAt(0).toUpperCase() || '?';
}
