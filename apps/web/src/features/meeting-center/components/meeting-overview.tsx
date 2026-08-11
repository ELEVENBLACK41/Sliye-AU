/**
 * 本文件展示会议中心真实的进行中与即将开始会议，并保留最近通话占位。
 */
import { ArrowRight, Clock3, History, Radio, Video } from 'lucide-react';
import type { MeetingCenterListItem, MeetingCenterOverviewResponse } from '@workspace/contracts/meetings';

import { Button } from '@workspace/ui/components/button';

/** 会议状态概览属性。 */
type MeetingOverviewProps = {
  /** 后端已分组的概览数据。 */
  data: MeetingCenterOverviewResponse;
  /** 打开详情抽屉。 */
  onSelect: (meeting: MeetingCenterListItem) => void;
};

/** 渲染正在进行、接下来与最近通话区域。 */
export function MeetingOverview({ data, onSelect }: MeetingOverviewProps) {
  const active = data.activeMeetings[0];

  return (
    <aside
      className="grid content-start gap-4 lg:h-full lg:min-h-0 lg:overflow-y-auto lg:pr-1"
      aria-label="会议状态概览"
    >
      <section className="relative min-h-56 overflow-hidden rounded-3xl bg-meeting-panel p-6 text-meeting-panel-foreground shadow-sm">
        <div
          className="absolute -right-10 -top-16 size-48 rounded-full border border-meeting-panel-foreground/10"
          aria-hidden
        />
        <div className="relative">
          <p className="flex items-center gap-2 text-sm text-meeting-panel-foreground/70">
            <span className="relative flex size-2.5" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-meeting-accent opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2.5 rounded-full bg-meeting-accent" />
            </span>
            正在进行
          </p>
          {active ? (
            <>
              <h2 className="mt-5 line-clamp-2 text-xl font-semibold">{active.title}</h2>
              <p className="mt-2 text-sm text-meeting-panel-foreground/60">
                {active.projectTitle} · {active.areaName}
              </p>
              {data.activeMeetings.length > 1 ? (
                <p className="mt-2 text-xs text-meeting-panel-foreground/60">
                  另有 {data.activeMeetings.length - 1} 场会议进行中
                </p>
              ) : null}
              <Button
                variant="ghost"
                className="mt-6 w-full justify-between px-0 text-meeting-panel-foreground hover:bg-transparent hover:text-meeting-panel-foreground"
                onClick={() => onSelect(active)}
              >
                <span className="flex items-center gap-2">
                  <Radio aria-hidden className="size-4" />
                  查看会议详情
                </span>
                <ArrowRight aria-hidden className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <h2 className="mt-5 text-xl font-semibold">暂无进行中的会议</h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-meeting-panel-foreground/60">
                你参与的会议开始后，会在这里显示真实状态。
              </p>
            </>
          )}
        </div>
      </section>

      <section className="rounded-3xl border bg-card/80 p-5 shadow-sm" aria-labelledby="upcoming-meetings-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="upcoming-meetings-title" className="font-semibold">
            接下来
          </h2>
          <Clock3 aria-hidden className="size-4 text-muted-foreground" />
        </div>
        <div className="mt-4 grid gap-2">
          {data.upcomingMeetings.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-5 py-7 text-center">
              <p className="text-sm font-medium">暂无即将开始的会议</p>
            </div>
          ) : (
            data.upcomingMeetings.map((meeting) => (
              <Button
                key={meeting.id}
                variant="ghost"
                className="h-auto justify-start rounded-2xl bg-muted/50 px-4 py-3 text-left"
                onClick={() => onSelect(meeting)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{meeting.title}</span>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">
                    {formatDateTime(meeting.scheduledAt)} · {meeting.projectTitle}
                  </span>
                </span>
              </Button>
            ))
          )}
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
            <p className="text-sm font-medium">通话数据待接入</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">快速通话与 LiveKit 不在本轮范围</p>
          </div>
        </div>
      </section>
    </aside>
  );
}

/** 格式化 UTC+8 会议时间。 */
function formatDateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '时间未设置';
}
