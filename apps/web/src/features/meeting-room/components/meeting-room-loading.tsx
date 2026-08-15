/**
 * 本文件提供与新版会议房间结构一致的全屏加载骨架。
 */
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染全屏会议房间加载状态。 */
export function MeetingRoomLoading() {
  return (
    <main className="min-h-dvh bg-meeting-room-background lg:grid lg:h-dvh lg:min-h-[42rem] lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col p-5 sm:p-7">
        <Skeleton className="mx-auto h-8 w-56 bg-meeting-room-control" />
        <div className="mt-8 grid min-h-0 flex-1 gap-3 sm:grid-cols-2">
          <Skeleton className="rounded-3xl bg-meeting-room-video" />
          <Skeleton className="rounded-3xl bg-meeting-room-video" />
        </div>
        <Skeleton className="mx-auto mt-4 h-20 w-full max-w-md rounded-2xl bg-meeting-room-control" />
        <Skeleton className="mx-auto mt-4 h-20 w-full max-w-3xl rounded-3xl bg-meeting-room-control" />
      </section>
      <Skeleton className="hidden h-full rounded-none bg-meeting-room-sidebar lg:block" />
    </main>
  );
}
