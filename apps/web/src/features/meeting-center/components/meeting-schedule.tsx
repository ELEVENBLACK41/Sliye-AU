/**
 * 本文件实现会议中心首页的周日程时间轴，目前以空状态保留未来会议卡片的布局空间。
 */
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 日程时间轴展示的工作时段。 */
const scheduleHours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

/** 当前占位周展示的星期标签。 */
const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 渲染会议中心的周日程时间轴空状态。 */
export function MeetingSchedule() {
  return (
    <section className="min-h-0 overflow-hidden rounded-3xl border bg-card/80 shadow-sm" aria-labelledby="schedule-title">
      <div className="flex flex-col gap-4 border-b px-5 py-5 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">本周日程</p>
            <h2 id="schedule-title" className="mt-1 text-xl font-semibold tracking-tight">
              今日安排
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" disabled aria-label="查看上一周">
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled aria-label="查看下一周">
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1" aria-label="本周日期">
          {weekDays.map((day, index) => (
            <div
              key={day}
              className={
                index === 1
                  ? 'rounded-xl bg-meeting-accent-soft py-2 text-center text-meeting-accent-foreground'
                  : 'rounded-xl py-2 text-center text-muted-foreground'
              }
            >
              <span className="block text-xs">{day}</span>
              <span className="mt-1 block text-sm font-semibold">—</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative min-h-[34rem] overflow-hidden">
        <div className="absolute inset-0 px-5 py-4 sm:px-7" aria-hidden>
          {scheduleHours.map((hour) => (
            <div key={hour} className="grid h-[3.15rem] grid-cols-[3.5rem_1fr] items-start gap-3">
              <span className="-translate-y-2 text-xs text-muted-foreground">{hour}</span>
              <span className="block border-t border-dashed border-meeting-line" />
            </div>
          ))}
        </div>

        <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
          <div className="max-w-xs rounded-2xl border bg-card/90 px-6 py-5 shadow-sm backdrop-blur-sm">
            <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-meeting-accent-soft text-meeting-accent-foreground">
              <CalendarClock aria-hidden />
            </span>
            <h3 className="mt-3 font-semibold">日程数据待接入</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">接口确认后，这里会按时间展示本周会议。</p>
          </div>
        </div>
      </div>
    </section>
  );
}
