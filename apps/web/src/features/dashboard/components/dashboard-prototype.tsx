/**
 * 本文件组合新版工作台原型的顶部导航、摘要和主体工作区，仅用于确认页面结构。
 */
import { DashboardSummaryPlaceholder } from './dashboard-summary-placeholder';
import { DashboardTopbarPlaceholder } from './dashboard-topbar-placeholder';
import { DashboardWorkspacePlaceholder } from './dashboard-workspace-placeholder';

/** 渲染不依赖真实数据、图标和交互的工作台布局原型。 */
export function DashboardPrototype() {
  return (
    <main className="min-h-dvh bg-[#adb4be] text-[#20211f]">
      <div
        className="flex min-h-[100dvh] w-full flex-col overflow-hidden border border-white/60 
        bg-[radial-gradient(circle_at_88%_20%,rgba(255,227,101,0.45),transparent_28%),linear-gradient(135deg,#f3f5f5_0%,#f5f2e8_58%,#fff4bd_100%)] 
        p-4 shadow-2xl shadow-slate-700/20 sm:min-h-[calc(100dvh-2rem)] sm:p-6 lg:min-h-[100dvh]"
      >
        {/* navigation 栏目 */}
        <DashboardTopbarPlaceholder />
        <DashboardSummaryPlaceholder />
        <DashboardWorkspacePlaceholder />
      </div>
    </main>
  );
}
