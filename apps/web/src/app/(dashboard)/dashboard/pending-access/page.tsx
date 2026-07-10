/**
 * 本文件实现新注册用户的待授权说明页，避免无部门、无角色用户误入业务模块。
 */
import { redirect } from 'next/navigation';
import { Clock3 } from 'lucide-react';

import { requireAuthenticatedUser } from '@/features/auth/services/auth-server.service';

/** 展示待管理员分配部门和角色的状态说明。 */
export default async function PendingAccessPage() {
  const currentUser = await requireAuthenticatedUser();

  if (currentUser.accessState === 'READY') {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-md border bg-background p-8 text-center">
      <Clock3 className="size-10 text-amber-600" aria-hidden />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">账号正在等待授权</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          你的邮箱验证已经完成，但管理员尚未分配部门和角色。完成分配后，重新打开页面即可进入业务区。
        </p>
      </div>
      <div className="w-full rounded-md bg-muted/50 p-4 text-left text-sm">
        <p>
          <span className="text-muted-foreground">当前账号：</span>
          {currentUser.email}
        </p>
        <p className="mt-2">
          <span className="text-muted-foreground">部门：</span>
          {currentUser.department?.name ?? '未分配'}
        </p>
        <p className="mt-2">
          <span className="text-muted-foreground">角色：</span>
          {currentUser.roles.map((role) => role.name).join('、') || '未分配'}
        </p>
      </div>
    </main>
  );
}
