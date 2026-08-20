/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-07-29 17:35:13
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-30 09:34:17
 * @FilePath: \NextNest\apps\web\src\features\dashboard\components\dashboard-profile-card-placeholder.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件使用认证资料展示新版工作台个人资料卡。
 */
import { UserRound } from 'lucide-react';
import type { AuthUser } from '@workspace/contracts/auth';

import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';

/** 工作台个人资料卡属性。 */
type DashboardProfileCardPlaceholderProps = {
  /** 当前登录用户的真实认证资料。 */
  user: AuthUser;
};

/** 渲染真实头像、显示名称、部门与角色摘要。 */
export function DashboardProfileCardPlaceholder({ user }: DashboardProfileCardPlaceholderProps) {
  const userName = user.name?.trim() || user.email;
  const roleNames = user.roles.map((role) => role.name).join('、');

  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-[inherit] lg:min-h-[22rem]">
      <Avatar className="h-full w-full rounded-[inherit] bg-muted">
        <AvatarImage src={user.avatarUrl ?? undefined} alt={`${userName}的头像`} className="object-cover" />
        <AvatarFallback className="flex h-full w-full flex-col gap-3 rounded-[inherit] bg-muted text-muted-foreground">
          <UserRound className="size-16" aria-hidden />
          <span className="max-w-[80%] truncate text-4xl font-light text-foreground/70">
            {userName.slice(0, 2).toUpperCase()}
          </span>
        </AvatarFallback>
      </Avatar>

      <div
        className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_48%,rgba(31,32,30,0.06)_68%,rgba(31,32,30,0.28)_100%)]"
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 px-5 pt-20 pb-5 text-white">
        <div
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(58,53,47,0)_0%,rgba(58,53,47,0.44)_44%,rgba(37,34,30,0.82)_100%)] backdrop-blur-[10px] [mask-image:linear-gradient(to_bottom,transparent_0%,black_42%)]"
          aria-hidden
        />

        <div className="relative flex min-w-0 -translate-y-5 items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-2xl leading-none font-medium tracking-tight">{userName}</h2>
            <p className="mt-2 truncate text-xs text-white/50">
              {[user.department?.name, roleNames].filter(Boolean).join(' · ') || '个人资料待完善'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
