/**
 * 本文件提供新版工作台各业务分块的结构化加载骨架。
 */
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染决策状态分布骨架。 */
export function DashboardDistributionSkeleton() {
  return (
    <div className="space-y-3" aria-label="决策状态分布加载中">
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-4 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-9 rounded-full" />
    </div>
  );
}

/** 渲染个人参与统计骨架。 */
export function DashboardStatisticsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4" aria-label="个人参与统计加载中">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-12 w-24 max-w-full rounded-xl" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** 渲染工作台普通业务面板骨架。 */
export function DashboardPanelSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col gap-4" aria-label={`${label}加载中`}>
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="size-10 rounded-full" />
      </div>
      <Skeleton className="h-12 w-24 rounded-xl" />
      <Skeleton className="min-h-28 flex-1 rounded-2xl" />
    </div>
  );
}

/** 渲染工作台会议时间线骨架。 */
export function DashboardMeetingSkeleton() {
  return (
    <div className="flex h-full min-h-80 flex-col gap-4" aria-label="会议时间线加载中">
      <Skeleton className="h-7 w-28 rounded-full" />
      <Skeleton className="h-4 w-44 rounded-full" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-11 rounded-xl" />
        ))}
      </div>
      <Skeleton className="min-h-52 flex-1 rounded-2xl" />
    </div>
  );
}

/** 渲染右侧决策卡片堆骨架。 */
export function DashboardDecisionStackSkeleton() {
  return (
    <div className="flex h-full min-h-[26rem] flex-col gap-4 p-5" aria-label="进行中决策加载中">
      <Skeleton className="h-10 w-36 rounded-xl bg-primary-foreground/10" />
      <Skeleton className="min-h-64 flex-1 rounded-3xl bg-primary-foreground/10" />
      <Skeleton className="h-4 w-40 rounded-full bg-primary-foreground/10" />
    </div>
  );
}
