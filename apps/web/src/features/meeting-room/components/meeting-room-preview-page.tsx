/**
 * 本文件组合新版全屏会议房间的画面区、上下文提示、控制栏和参会信息侧栏。
 */
import Link from 'next/link';
import { ArrowLeft, CircleAlert, LockKeyhole } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

import { MeetingDecisionCollaborationPanel } from './meeting-decision-collaboration-panel';
import { MeetingRoomControlBar } from './meeting-room-control-bar';
import { MeetingVideoStage } from './meeting-video-stage';

/** 渲染不依赖会议业务接口的全屏房间前端预览。 */
export function MeetingRoomPreviewPage() {
  return (
    <main className="min-h-dvh bg-meeting-room-background text-meeting-room-foreground lg:grid lg:h-dvh lg:min-h-[42rem] lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="会议画面与控制区">
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-start gap-4 px-5 py-5 sm:px-8">
          <Button
            asChild
            variant="ghost"
            className="w-fit justify-self-start rounded-full text-meeting-room-foreground/70 hover:bg-meeting-room-control hover:text-meeting-room-foreground"
          >
            <Link href="/meetings">
              <ArrowLeft aria-hidden />
              <span className="hidden sm:inline">返回会议中心</span>
            </Link>
          </Button>

          <div className="min-w-0 text-center">
            <div className="flex items-center justify-center gap-2">
              <h1 className="truncate text-lg font-semibold sm:text-2xl">会议房间预览</h1>
              <span className="shrink-0 rounded-full border border-meeting-accent/40 px-3 py-1 text-xs text-meeting-accent">
                前端预览
              </span>
            </div>
            <p className="mt-2 flex items-center justify-center gap-2 text-xs text-meeting-room-foreground/55 sm:text-sm">
              <span className="size-2 rounded-full bg-meeting-room-success" aria-hidden />
              会议数据待接入
              <span aria-hidden>·</span>
              <LockKeyhole aria-hidden className="size-3.5" />
              仅参与人可见
            </p>
          </div>

          <span aria-hidden />
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-7 sm:pb-6">
          <MeetingVideoStage />

          <div className="mx-auto mt-4 flex w-full max-w-md items-center justify-between gap-4 rounded-2xl border border-meeting-room-foreground/10 bg-meeting-room-control px-5 py-4 shadow-xl">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CircleAlert aria-hidden className="size-4 text-meeting-accent" />
                决策协作流程已预留
              </p>
              <p className="mt-1 truncate text-xs text-meeting-room-foreground/55">
                议题与决策数据接入后，在右侧完成全过程协作。
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="shrink-0 border-meeting-accent/50 bg-transparent text-meeting-room-foreground"
            >
              关联上下文
            </Button>
          </div>

          <MeetingRoomControlBar />
        </div>
      </section>

      <aside className="hidden min-h-0 border-l border-meeting-line bg-meeting-room-sidebar text-foreground lg:block">
        <MeetingDecisionCollaborationPanel />
      </aside>
    </main>
  );
}
