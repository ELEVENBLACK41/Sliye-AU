/**
 * 本文件实现统一中文 403 页面，用于承接服务端页面权限校验失败的跳转。
 */
import Link from 'next/link';
import { ShieldX } from 'lucide-react';

import { requireReadyUser } from '@/features/auth/services/auth-server.service';
import { Button } from '@workspace/ui/components/button';

/** 展示当前账号缺少目标功能权限的说明。 */
export default async function ForbiddenPage() {
  await requireReadyUser();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-md border bg-background p-8 text-center">
      <ShieldX className="size-10 text-destructive" aria-hidden />
      <div className="space-y-2">
        <p className="text-sm font-medium text-destructive">403 · 禁止访问</p>
        <h1 className="text-2xl font-semibold tracking-tight">当前账号没有此功能权限</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          页面展示权限和后端接口权限会同时校验。若确实需要使用，请联系超级管理员调整角色或直接授权。
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard">返回工作台</Link>
      </Button>
    </main>
  );
}
