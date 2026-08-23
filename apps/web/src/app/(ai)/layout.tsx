/**
 * 本文件为 AI 工作区提供认证校验、固定顶部导航和单一高度约束外壳。
 */
import type { ReactNode } from 'react';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { DashboardTopbarPlaceholder } from '@/features/dashboard/components/dashboard-topbar-placeholder';
import { ORGANIZATION_ENTRY_PERMISSIONS } from '@/features/organization-access/utils/organization-capabilities';

/** AI 工作区布局属性。 */
type AiWorkspaceLayoutProps = Readonly<{
  /** 当前 AI 页面内容。 */
  children: ReactNode;
}>;

/** 渲染不会产生页面级双重滚动的 AI 工作区外壳。 */
export default async function AiWorkspaceLayout({ children }: AiWorkspaceLayoutProps) {
  const currentUser = await requireServerPermission('ai:chat:use');
  const canAccessOrganization =
    currentUser.isSuperAdmin ||
    ORGANIZATION_ENTRY_PERMISSIONS.some((permission) => currentUser.permissions.includes(permission));

  return (
    <main className="fixed inset-0 flex min-h-0 flex-col overflow-hidden bg-background p-3 text-foreground sm:p-4 lg:p-6">
      <DashboardTopbarPlaceholder
        canAccessOrganization={canAccessOrganization}
        currentUser={{
          name: currentUser.name,
          email: currentUser.email,
          avatarUrl: currentUser.avatarUrl,
        }}
      />
      <div className="min-h-0 flex-1 pt-3 sm:pt-4">{children}</div>
    </main>
  );
}
