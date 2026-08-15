/**
 * 本文件提供与会议中心首页布局一致的加载骨架，避免路由切换时发生明显布局跳动。
 */
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染会议中心标题、日程和右侧概览的加载骨架。 */
export function MeetingCenterLoading() {
  return (
    <section
      className="flex min-h-0 flex-1 flex-col py-7 sm:py-9 lg:h-full lg:overflow-hidden lg:py-6"
      aria-label="会议中心加载中"
    >
      <header className="flex justify-end gap-5">
        <div className="flex gap-3">
          <Skeleton className="h-11 w-28 rounded-xl" />
          <Skeleton className="h-11 w-28 rounded-xl" />
        </div>
      </header>

      <div className="mt-5 flex items-center gap-2">
        <Skeleton className="h-10 w-28 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>

      <div className="mt-5 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.75fr)_minmax(20rem,1fr)] lg:overflow-hidden">
        <Skeleton className="min-h-[42rem] rounded-3xl lg:h-full lg:min-h-0" />
        <div className="grid content-start gap-4 lg:h-full lg:min-h-0 lg:overflow-hidden">
          <Skeleton className="h-56 rounded-3xl" />
          <Skeleton className="h-44 rounded-3xl" />
          <Skeleton className="h-36 rounded-3xl" />
        </div>
      </div>
    </section>
  );
}
