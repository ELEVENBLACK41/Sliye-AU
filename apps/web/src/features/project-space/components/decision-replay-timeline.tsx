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
    <section className="border-t border-black/10 bg-white/30 px-4 py-3" aria-labelledby="replay-title">
      <header className="flex items-center justify-between gap-4">
        <h2 id="replay-title" className="text-xs font-semibold">决策过程回放</h2>
        <div className="flex items-center gap-4 text-[11px] text-black/50">
          <Button type="button" variant="outline" size="sm" className="h-7 rounded-lg border-black/10 bg-white/45 text-[10px] shadow-none">1×</Button>
          <label className="flex items-center gap-2" htmlFor="key-events-only">
            仅看关键事件
            <Switch id="key-events-only" defaultChecked aria-label="仅看关键事件" />
          </label>
        </div>
      </header>

      <div className="mt-3 grid grid-cols-[2.5rem_9.5rem_minmax(38rem,1fr)] items-start gap-3 overflow-x-auto">
        <Button type="button" variant="outline" size="icon" className="size-10 rounded-xl border-black/20 bg-white/55 shadow-none" aria-label="播放决策过程">
          <Play className="size-4 fill-current" aria-hidden />
        </Button>
        <div className="flex h-10 items-center gap-2 rounded-lg border border-black/10 bg-white/45 px-2 text-[9px] text-black/55">
          <span>2026.04.12</span><span>—</span><span>2026.05.28</span><CalendarDays className="ml-auto size-3" aria-hidden />
        </div>
        <ol className="relative grid min-w-[38rem] grid-cols-8 pt-1" aria-label="决策回放事件">
          <span className="absolute top-[8px] right-[6%] left-[6%] h-px bg-black/20" aria-hidden />
          {replayEvents.map((event) => (
            <li key={`${event.date}-${event.label}`} className="relative flex min-w-0 flex-col items-center px-1 text-center">
              <span className={`relative z-10 size-2 rounded-full ${event.active ? 'bg-[#f0b900] ring-4 ring-[#f0b900]/15' : 'border border-black/35 bg-[#f8f7f2]'}`} aria-hidden />
              <time className="mt-2 text-[8px] text-black/45">{event.date}</time>
              <span className="mt-0.5 line-clamp-2 text-[8px] leading-3 text-black/65">{event.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
