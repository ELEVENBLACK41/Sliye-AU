/**
 * 本文件提供会议房间流式加载骨架。
 */
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染全屏会议房间加载状态。 */
export default function MeetingRoomLoading() {
  return (
    <main className="min-h-dvh bg-muted/30 p-4 lg:p-6">
      <div className="mx-auto grid max-w-[1600px] gap-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[42rem] w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </main>
  );
}
