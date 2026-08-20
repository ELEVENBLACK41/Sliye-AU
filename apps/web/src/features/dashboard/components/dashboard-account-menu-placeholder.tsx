/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-07-29 13:46:53
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-29 13:57:31
 * @FilePath: \NextNest\apps\web\src\features\dashboard\components\dashboard-account-menu-placeholder.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 这里是个人头像部分的的下拉框，暂时占位
 */
'use client';

import { Loader2, LogOut, Settings, UserRound } from 'lucide-react';
import type { AuthUser } from '@workspace/contracts/auth';

import { useLogout } from '@/features/auth/hooks/use-logout';
import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';

/** 用户菜单属性。 */
type DashboardAccountMenuPlaceholderProps = {
  /** 当前登录用户的真实认证资料。 */
  user: Pick<AuthUser, 'name' | 'email' | 'avatarUrl'>;
};

/** 渲染真实用户资料摘要，并提供右上角退出登录入口。 */
export function DashboardAccountMenuPlaceholder({ user }: DashboardAccountMenuPlaceholderProps) {
  const { isPending, logout } = useLogout();
  const userName = user.name?.trim() || user.email;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-12 rounded-full border border-white/65 bg-white/20 text-[#31322f] shadow-[0_10px_30px_rgba(41,42,39,0.08)] backdrop-blur-sm backdrop-saturate-150 hover:bg-white/30"
          aria-label="打开用户菜单"
        >
          <Avatar className="size-8">
            <AvatarImage src={user.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-xs">{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-2xl border-black/10 bg-white/90 p-2 text-[#31322f] shadow-xl backdrop-blur-xl"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate text-sm font-semibold">{userName}</span>
          <span className="mt-0.5 block truncate text-xs font-normal text-black/50">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-black/10" />
        <DropdownMenuGroup>
          <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-black/5 focus:text-[#31322f]">
            <UserRound aria-hidden />
            个人资料
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-black/5 focus:text-[#31322f]">
            <UserRound aria-hidden />
            账号设置
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-black/5 focus:text-[#31322f]">
            <UserRound aria-hidden />
            外观设置
          </DropdownMenuItem>
          <DropdownMenuItem className="rounded-xl px-3 py-2.5 focus:bg-black/5 focus:text-[#31322f]">
            <Settings aria-hidden />
            通知设置
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="bg-black/10" />
        <DropdownMenuItem
          variant="destructive"
          className="rounded-xl px-3 py-2.5 focus:bg-red-50"
          disabled={isPending}
          onSelect={() => void logout()}
        >
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
          {isPending ? '正在退出...' : '退出登录'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
