/**
 * 本文件组合新版工作台原型的导航、页头和内容区域，用于确认整体视觉结构。
 */
import { DashboardHeaderPlaceholder } from './dashboard-header-placeholder';
import { DashboardNavigationPlaceholder } from './dashboard-navigation-placeholder';
import { DashboardOverviewPlaceholder } from './dashboard-overview-placeholder';

/** 渲染完整的深色工作台结构原型，当前不包含真实数据和客户端交互。 */
export function DashboardPrototype() {
  return (
    <main className="min-h-dvh bg-[#1b1c1a] p-3 text-white sm:p-5 lg:p-7">
      <div className="mx-auto grid min-h-[calc(100dvh-1.5rem)] max-w-[1600px] items-start gap-4 sm:min-h-[calc(100dvh-2.5rem)] lg:min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[4.75rem_minmax(0,1fr)] lg:gap-7">
        <DashboardNavigationPlaceholder />

        <div className="min-w-0 space-y-6">
          <DashboardHeaderPlaceholder />
          <DashboardOverviewPlaceholder />
        </div>
      </div>
    </main>
  );
}
