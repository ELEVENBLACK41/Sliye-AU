/**
 * 本文件实现会议中心右侧状态概览，保留进行中会议、后续日程与最近通话三个业务区域。
 */
import { ArrowRight, Clock3, History, Radio, Video } from 'lucide-react';

/** 渲染会议中心右侧的三个业务空状态区域。 */
export function MeetingOverview() {
  return (
    <aside className="grid content-start gap-4" aria-label="会议状态概览">
      <section className="relative min-h-56 overflow-hidden rounded-3xl bg-meeting-panel p-6 text-meeting-panel-foreground shadow-sm">
        <div className="absolute -right-10 -top-16 size-48 rounded-full border border-meeting-panel-foreground/10" aria-hidden />
        <div className="absolute -bottom-20 right-12 size-52 rounded-full border border-meeting-panel-foreground/10" aria-hidden />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm text-meeting-panel-foreground/70">
            <span className="relative flex size-2.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-meeting-accent opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2.5 rounded-full bg-meeting-accent" />
            </span>
            正在进行
          </p>
          <h2 className="mt-5 text-xl font-semibold">暂无进行中的会议</h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-meeting-panel-foreground/60">
            当有会议开始后，将在这里展示参与状态与进入会议入口。
          </p>
          <div className="mt-7 flex items-center justify-between gap-3 text-sm text-meeting-panel-foreground/70">
            <span className="flex items-center gap-2">
              <Radio aria-hidden className="size-4" />
              等待会议开始
            </span>
            <ArrowRight aria-hidden className="size-4 opacity-40" />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border bg-card/80 p-5 shadow-sm" aria-labelledby="upcoming-meetings-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="upcoming-meetings-title" className="font-semibold">
            接下来
          </h2>
          <Clock3 aria-hidden className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-5 rounded-2xl border border-dashed px-5 py-7 text-center">
          <p className="text-sm font-medium">暂无可展示的会议</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">接入日程接口后展示即将开始的会议。</p>
        </div>
      </section>

      <section className="rounded-3xl border bg-card/80 p-5 shadow-sm" aria-labelledby="recent-calls-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="recent-calls-title" className="font-semibold">
            最近通话
          </h2>
          <History aria-hidden className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-5 flex items-center gap-4 rounded-2xl bg-muted/60 px-4 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground">
            <Video aria-hidden className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">暂无通话记录</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">快速通话能力接入后自动保留记录</p>
          </div>
        </div>
      </section>
    </aside>
  );
}
