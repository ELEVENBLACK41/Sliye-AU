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

import { LogOut, Settings, UserRound } from 'lucide-react';

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

/** 渲染暂不执行路由跳转和退出操作的用户下拉菜单。 */
export function DashboardAccountMenuPlaceholder() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-12 rounded-full bg-white/60 text-[#31322f] hover:bg-white/80"
          aria-label="打开用户菜单"
        >
          <UserRound className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-2xl border-black/10 bg-white/90 p-2 text-[#31322f] shadow-xl backdrop-blur-xl"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block text-sm font-semibold">当前用户</span>
          <span className="mt-0.5 block text-xs font-normal text-black/50">个人入口占位</span>
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
        >
          <LogOut aria-hidden />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
