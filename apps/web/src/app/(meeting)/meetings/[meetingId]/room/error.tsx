/**
 * 本文件处理新版全屏会议房间的路由级异常，并提供返回会议中心的恢复入口。
 */
'use client';

import Link from 'next/link';
import { VideoOff } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 会议房间错误边界属性。 */
type MeetingRoomErrorProps = {
  /** Next.js 捕获到的当前路由异常。 */
  error: Error & { digest?: string };
  /** 重新执行当前路由渲染的回调。 */
  reset: () => void;
};

/** 渲染脱敏的会议房间失败状态。 */
export default function MeetingRoomError({ reset }: MeetingRoomErrorProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-meeting-room-background p-6 text-meeting-room-foreground">
      <section className="max-w-md rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-control p-8 text-center shadow-2xl">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <VideoOff aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">会议房间暂时无法打开</h1>
        <p className="mt-2 text-sm leading-6 text-meeting-room-foreground/60">可以重新加载房间，或先返回会议中心。</p>
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="outline" onClick={reset}>
            重新加载
          </Button>
          <Button asChild className="bg-meeting-accent text-meeting-accent-foreground hover:bg-meeting-accent/85">
            <Link href="/meetings">返回会议中心</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
