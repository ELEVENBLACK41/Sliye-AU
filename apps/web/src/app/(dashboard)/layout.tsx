/**
 * 本文件为所有已登录页面提供统一布局；具体业务权限由各页面继续细分校验。
 */
import type { ReactNode } from 'react';

import { requireAuthenticatedUser } from '@/features/auth/services/auth-server.service';
import { DashboardShell } from '@/features/navigation';

/** 为 Dashboard 路由组提供统一的侧边栏布局。 */
export default async function Layout({ children }: { children: ReactNode }) {
  const currentUser = await requireAuthenticatedUser();

  return <DashboardShell currentUser={currentUser}>{children}</DashboardShell>;
}
