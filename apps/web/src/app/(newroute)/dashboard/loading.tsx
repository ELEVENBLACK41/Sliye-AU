/**
 * 本文件提供工作台路由进入权限校验阶段时的整体结构骨架。
 */
import {
  DashboardDecisionStackSkeleton,
  DashboardDistributionSkeleton,
  DashboardMeetingSkeleton,
  DashboardPanelSkeleton,
  DashboardStatisticsSkeleton,
} from '@/features/dashboard/components/dashboard-skeletons';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染工作台首个服务端响应到达前的页面骨架。 */
export default function DashboardLoading() {
  return (
    <section className="flex flex-1 flex-col" aria-label="工作台加载中">
      <div className="grid gap-7 py-9 lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.8fr)] lg:items-end lg:py-12">
        <div className="space-y-7">
          <div className="space-y-3">
            <Skeleton className="h-12 w-96 max-w-full rounded-2xl" />
            <Skeleton className="h-4 w-56 rounded-full" />
          </div>
          <DashboardDistributionSkeleton />
        </div>
        <DashboardStatisticsSkeleton />
      </div>
      <div className="grid flex-1 gap-2.5 md:grid-cols-2 xl:grid-cols-4 xl:grid-rows-2">
        <Skeleton className="min-h-72 rounded-[1.75rem]" />
        <div className="rounded-[1.75rem] bg-background/55 p-5">
          <DashboardPanelSkeleton label="决策趋势" />
        </div>
        <div className="rounded-[1.75rem] bg-background/55 p-5">
          <DashboardPanelSkeleton label="提案采纳率" />
        </div>
        <div className="row-span-2 rounded-[1.75rem] bg-decision-panel">
          <DashboardDecisionStackSkeleton />
        </div>
        <Skeleton className="min-h-72 rounded-[1.75rem]" />
        <div className="p-5 md:col-span-2">
          <DashboardMeetingSkeleton />
        </div>
      </div>
    </section>
  );
}
