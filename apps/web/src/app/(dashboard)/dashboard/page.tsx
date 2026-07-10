/**
 * 本文件实现工作台首页，并在服务端验证工作台访问权限。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';

/** 渲染已完成授权用户的工作台首页。 */
export default async function DashboardPage() {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.dashboard.access);

  return (
    <main className="flex flex-col gap-4 rounded-md border bg-background p-6">
      <div>
        <p className="text-sm text-muted-foreground">欢迎回来</p>
        <h1 className="text-2xl font-semibold tracking-tight">{currentUser.name || currentUser.email}</h1>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-md border p-4">
          <dt className="text-muted-foreground">所属部门</dt>
          <dd className="mt-1 font-medium">{currentUser.department?.name ?? '尚未分配'}</dd>
        </div>
        <div className="rounded-md border p-4">
          <dt className="text-muted-foreground">当前角色</dt>
          <dd className="mt-1 font-medium">{currentUser.roles.map((role) => role.name).join('、') || '尚未分配'}</dd>
        </div>
      </dl>
    </main>
  );
}
