/**
 * 本文件为新版工作区一级业务路由提供共享视觉外壳和固定顶部导航。
 */
import type { ReactNode } from 'react';

import { DashboardTopbarPlaceholder } from '@/features/dashboard/components/dashboard-topbar-placeholder';

/** 新版工作区共享布局属性。 */
type WorkspaceLayoutProps = Readonly<{
  /** 当前一级业务路由渲染的页面内容。 */
  children: ReactNode;
}>;

/** 渲染新版工作台、项目空间等一级业务路由共用的页面外壳。 */
export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return (
    <main className="relative min-h-dvh overflow-x-clip bg-[#adb4be] text-[#20211f] lg:fixed lg:inset-0 lg:min-h-0 lg:overflow-hidden">
      <div
        className="flex min-h-dvh w-full flex-col border border-white/60 lg:h-full lg:min-h-0 lg:overflow-y-auto
          bg-[radial-gradient(circle_at_88%_20%,rgba(255,227,101,0.45),transparent_28%),linear-gradient(135deg,#f3f5f5_0%,#f5f2e8_58%,#fff4bd_100%)]
          p-4 shadow-2xl shadow-slate-700/20 sm:p-6"
      >
        <DashboardTopbarPlaceholder />
        {children}
      </div>
    </main>
  );
}
