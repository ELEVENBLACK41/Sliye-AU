/**
 * 本文件组合新版全屏会议视图；LiveKit 生命周期由根级会议 Session Controller 持有。
 */
'use client';

import { useEffect } from 'react';
import { ArrowLeft, Radio, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { Button } from '@workspace/ui/components/button';
import { MeetingSessionControlBar } from '@/features/meeting-session/components/meeting-session-control-bar';
import { MeetingSessionSurface } from '@/features/meeting-session/components/meeting-session-surface';
import { useMeetingSession } from '@/features/meeting-session/hooks/use-meeting-session';
import { useMeetingSessionStore } from '@/features/meeting-session/store/meeting-session-store';
import { MeetingDecisionCollaborationPanel } from './meeting-decision-collaboration-panel';

/** 自研会议室页面属性。 */
type MeetingRoomLivePageProps = {
  /** 服务端校验后的会议详情。 */
  meeting: MeetingDetail;
  /** 当前登录用户主键。 */
  currentUserId: number;
};

/** 将会议会话状态转换成房间头部文案。 */
function formatConnectionStatus(status: ReturnType<typeof useMeetingSession>['status']): string {
  if (status === 'CONNECTED') return '已连接';
  if (status === 'RECONNECTING') return '正在重连';
  if (status === 'OWNED_BY_OTHER_TAB') return '其他标签参会中';
  if (status === 'ERROR') return '连接异常';
  if (status === 'ENDING') return '正在结束';
  return '正在连接';
}

/** 渲染连接全局会议会话后的全屏自研会议房间。 */
export function MeetingRoomLivePage({ meeting, currentUserId }: MeetingRoomLivePageProps) {
  const router = useRouter();
  const session = useMeetingSession();

  useEffect(() => {
    void session.controller.open({ meeting, currentUserId }).catch(() => {
      const activeMeetingId = useMeetingSessionStore.getState().meetingId;
      if (activeMeetingId !== null && activeMeetingId !== meeting.id) {
        router.replace(`/meetings/${activeMeetingId}/room`);
      }
    });
    return () => session.controller.minimize();
  }, [currentUserId, meeting, router, session.controller]);

  /** 返回会议中心时保留媒体连接并进入悬浮小窗。 */
  function handleMinimize(): void {
    session.controller.minimize();
    router.push('/meetings');
  }

  /** 普通参与者离开后返回会议中心。 */
  function handleLeft(): void {
    router.replace('/meetings');
  }

  return (
    <main className="min-h-dvh bg-meeting-room-background text-meeting-room-foreground lg:grid lg:h-dvh lg:min-h-[42rem] lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="会议画面与控制区">
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-start gap-4 px-5 py-5 sm:px-8">
          <Button
            type="button"
            variant="ghost"
            onClick={handleMinimize}
            className="w-fit rounded-full text-meeting-room-foreground/70"
          >
            <ArrowLeft aria-hidden />
            <span className="hidden sm:inline">返回会议中心</span>
          </Button>
          <div className="min-w-0 text-center">
            <h1 className="truncate text-lg font-semibold sm:text-2xl">{session.title || meeting.title}</h1>
            <p className="mt-2 flex items-center justify-center gap-2 text-xs text-meeting-room-foreground/55 sm:text-sm">
              <Radio
                aria-hidden
                className={session.status === 'CONNECTED' ? 'size-3.5 text-meeting-room-success' : 'size-3.5'}
              />
              {formatConnectionStatus(session.status)} · {session.areaName || '独立会议'} · {session.participantCount} 人在线
            </p>
          </div>
          <span aria-hidden />
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-7 sm:pb-6">
          {session.audioBlocked ? (
            <Button onClick={() => void session.controller.resumeAudio()} className="mb-3 self-center rounded-full">
              <Volume2 aria-hidden />
              点击恢复会议声音
            </Button>
          ) : null}
          {session.deviceWarning ? (
            <p className="mb-3 rounded-2xl border border-meeting-room-foreground/10 bg-meeting-room-control px-4 py-2 text-center text-sm text-meeting-room-foreground/70">
              {session.deviceWarning}
            </p>
          ) : null}
          {session.status === 'OWNED_BY_OTHER_TAB' ? (
            <Button
              type="button"
              onClick={() => void session.controller.requestTakeover()}
              className="mb-3 self-center rounded-full bg-meeting-accent text-meeting-accent-foreground hover:bg-meeting-accent/85"
            >
              切换到此标签
            </Button>
          ) : null}
          {session.status === 'ERROR' ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void session.controller.retry()}
              className="mb-3 self-center rounded-full border-meeting-room-foreground/15 bg-transparent text-meeting-room-foreground"
            >
              重新连接
            </Button>
          ) : null}
          <MeetingSessionSurface variant="full" />
          <MeetingSessionControlBar onLeave={handleLeft} />
        </div>
      </section>
      <aside className="hidden min-h-0 border-l border-meeting-line bg-meeting-room-sidebar text-foreground lg:block">
        <MeetingDecisionCollaborationPanel />
      </aside>
    </main>
  );
}
