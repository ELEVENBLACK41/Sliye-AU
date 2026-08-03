/**
 * 本文件展示项目空间底部的决策过程回放控制与关键事件时间轴。
 */
import { CalendarDays, Play } from 'lucide-react';

import { replayEvents } from '../project-space.constants';
import { Button } from '@workspace/ui/components/button';
import { Switch } from '@workspace/ui/components/switch';

/** 渲染决策过程回放时间轴。 */
export function DecisionReplayTimeline() {
  return (
    <section
      className="min-h-48 shrink-0 border-t border-black/10 bg-white/30 px-5 py-5"
      aria-labelledby="replay-title"
    >
      <header className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h2 id="replay-title" className="text-base font-semibold">
          决策过程回放
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-black/55">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-lg border-black/10 bg-white/45 text-sm shadow-none"
          >
            1×
          </Button>
          <label className="flex items-center gap-2 whitespace-nowrap" htmlFor="key-events-only">
            仅看关键事件
            <Switch id="key-events-only" defaultChecked aria-label="仅看关键事件" />
          </label>
        </div>
      </header>

      <div
        className="mt-5 w-full min-w-0 touch-pan-x overflow-x-auto overscroll-x-contain pb-3"
        aria-label="可横向滚动的决策回放轨道"
      >
        <div className="flex w-max min-w-full items-start gap-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12 shrink-0 rounded-xl border-black/20 bg-white/55 shadow-none"
            aria-label="播放决策过程"
          >
            <Play className="size-5 fill-current" aria-hidden />
          </Button>
          <div className="flex h-12 w-52 shrink-0 items-center gap-2 rounded-lg border border-black/10 bg-white/45 px-3 text-xs text-black/60">
            <span>2026.04.12</span>
            <span>—</span>
            <span>2026.05.28</span>
            <CalendarDays className="ml-auto size-4 shrink-0" aria-hidden />
          </div>
          <ol className="relative flex min-w-max pt-1.5" aria-label="决策回放事件">
            <span className="absolute top-3 right-14 left-14 h-px bg-black/20" aria-hidden />
            {replayEvents.map((event) => (
              <li
                key={`${event.date}-${event.label}`}
                className="relative flex w-28 shrink-0 flex-col items-center px-2 text-center"
              >
                <span
                  className={`relative z-10 size-3 rounded-full ${
                    event.active
                      ? 'bg-[#f0b900] ring-4 ring-[#f0b900]/15'
                      : 'border border-black/35 bg-[#f8f7f2]'
                  }`}
                  aria-hidden
                />
                <time className="mt-3 text-xs font-medium text-black/50">{event.date}</time>
                <span className="mt-1 line-clamp-2 text-sm leading-5 text-black/70">{event.label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
