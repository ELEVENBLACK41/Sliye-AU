/**
 * 本文件渲染跨新版业务路由持续存在的应用内会议悬浮小窗。
 */
'use client';

import { ChevronDown, ChevronUp, Maximize2, Radio, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@workspace/ui/components/button';
import { MeetingSessionControlBar } from './meeting-session-control-bar';
import { MeetingSessionSurface } from './meeting-session-surface';
import { useMeetingSession } from '../hooks/use-meeting-session';

/** 将内部连接状态转换成稳定中文文案。 */
function formatStatus(status: ReturnType<typeof useMeetingSession>['status']): string {
  if (status === 'CONNECTED') return '会议进行中';
  if (status === 'RECONNECTING') return '正在重连';
  if (status === 'OWNED_BY_OTHER_TAB') return '其他标签参会中';
  if (status === 'ERROR') return '连接异常';
  if (status === 'ENDING') return '正在结束';
  return '正在连接';
}

/** 渲染全局悬浮小窗、紧凑状态条和跨标签接管入口。 */
export function MeetingMiniWindow() {
  const router = useRouter();
  const session = useMeetingSession();
  const visible =
    session.presentationMode === 'MINI' &&
    session.meetingId !== null &&
    session.status !== 'IDLE' &&
    session.status !== 'ENDED';

  if (!visible) return null;

  /** 恢复当前会议的新版全屏房间。 */
  function restoreFullRoom(): void {
    if (session.meetingId === null) return;
    session.controller.showFull();
    router.push(`/meetings/${session.meetingId}/room`);
  }

  if (session.miniCollapsed) {
    return (
      <aside className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-meeting-room-foreground/10 bg-meeting-room-control px-3 py-2 text-meeting-room-foreground shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:mx-0 sm:w-80" aria-label="已收起的会议小窗">
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-meeting-accent text-meeting-accent-foreground">
          <Radio aria-hidden className="size-4" />
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={restoreFullRoom}>
          <span className="block truncate text-sm font-medium">{session.title}</span>
          <span className="block text-[0.7rem] text-meeting-room-foreground/55">{formatStatus(session.status)}</span>
        </button>
        <Button type="button" variant="ghost" size="icon" className="rounded-xl text-meeting-room-foreground" aria-label="展开会议小窗" onClick={() => session.controller.toggleMiniCollapsed()}>
          <ChevronUp aria-hidden />
        </Button>
      </aside>
    );
  }

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[70] mx-auto w-auto overflow-hidden rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-background text-meeting-room-foreground shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:mx-0 sm:w-[23rem]" aria-label="会议悬浮小窗">
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-meeting-accent text-meeting-accent-foreground">
          <Radio aria-hidden className="size-4" />
          {session.status === 'CONNECTED' ? <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-meeting-room-background bg-meeting-room-success" /> : null}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{session.title}</h2>
          <p className="mt-0.5 flex items-center gap-2 text-[0.7rem] text-meeting-room-foreground/55">
            <span>{formatStatus(session.status)}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1"><UsersRound aria-hidden className="size-3" />{session.participantCount} 人</span>
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="rounded-xl text-meeting-room-foreground" aria-label="恢复全屏会议" onClick={restoreFullRoom}>
          <Maximize2 aria-hidden />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="rounded-xl text-meeting-room-foreground" aria-label="收起会议小窗" onClick={() => session.controller.toggleMiniCollapsed()}>
          <ChevronDown aria-hidden />
        </Button>
      </header>
      <div className="px-3">
        <MeetingSessionSurface variant="mini" />
      </div>
      <footer className="p-3">
        {session.status === 'OWNED_BY_OTHER_TAB' ? (
          <Button type="button" className="w-full rounded-xl bg-meeting-accent text-meeting-accent-foreground hover:bg-meeting-accent/85" onClick={() => void session.controller.requestTakeover()}>
            切换到此标签
          </Button>
        ) : session.status === 'ERROR' ? (
          <Button type="button" variant="outline" className="w-full rounded-xl border-meeting-room-foreground/15 bg-transparent text-meeting-room-foreground" onClick={() => void session.controller.retry()}>
            重新连接
          </Button>
        ) : (
          <MeetingSessionControlBar compact />
        )}
      </footer>
    </aside>
  );
}
