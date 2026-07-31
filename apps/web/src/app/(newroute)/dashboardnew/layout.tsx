/**
 * 本文件提供新版工作台路由共享的视觉外壳和固定顶部导航。
 */
import type { ReactNode } from 'react';

import { DashboardTopbarPlaceholder } from '@/features/dashboard/components/dashboard-topbar-placeholder';

/** 新版工作台路由布局的属性。 */
type DashboardNewLayoutProps = Readonly<{
  /** 当前子路由渲染的页面内容。 */
  children: ReactNode;
}>;

/** 渲染新版工作台各页面共用的渐变背景与顶部导航。 */
export default function DashboardNewLayout({ children }: DashboardNewLayoutProps) {
  return (
    <main className="min-h-dvh bg-[#adb4be] text-[#20211f]">
      <div
        className="flex min-h-dvh w-full flex-col border border-white/60
          bg-[radial-gradient(circle_at_88%_20%,rgba(255,227,101,0.45),transparent_28%),linear-gradient(135deg,#f3f5f5_0%,#f5f2e8_58%,#fff4bd_100%)]
          p-4 shadow-2xl shadow-slate-700/20 sm:p-6"
      >
        <DashboardTopbarPlaceholder />
        {children}
      </div>
    </main>
  );
}
