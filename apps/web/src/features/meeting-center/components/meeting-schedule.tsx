/**
 * 本文件渲染会议中心横向日期选择器与选中日期的二十四小时时间轴。
 */
'use client';

import { useLayoutEffect, useRef } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MeetingCenterListItem } from '@workspace/contracts/meetings';

import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';

import { layoutMeetingScheduleItems, type PositionedMeeting } from '../utils/meeting-schedule-layout';

/** 单日时间轴起始小时。 */
const START_HOUR = 0;
/** 单日时间轴结束小时。 */
const END_HOUR = 24;
/** 每小时在时间轴中占用的像素高度。 */
const HOUR_HEIGHT = 56;
/** 没有会议时默认滚动到的小时。 */
const DEFAULT_VISIBLE_HOUR = 8;
/** 周一到周日的中文短名。 */
const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 日程组件属性。 */
type MeetingScheduleProps = {
  /** 当前选中的 UTC+8 日期键。 */
  date: string;
  /** 当前周内的会议。 */
  items: MeetingCenterListItem[];
  /** 日期切换回调。 */
  onDateChange: (date: string) => void;
  /** 打开会议详情回调。 */
  onSelect: (meeting: MeetingCenterListItem) => void;
};

/** 渲染横向一周选择器和选中日的二十四小时时间轴。 */
export function MeetingSchedule({ date, items, onDateChange, onSelect }: MeetingScheduleProps) {
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const days = createWeekDays(date);
  const today = formatDateKey(new Date());
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index);
  const selectedDayItems = items.filter((item) => formatDateKey(getMeetingScheduleDate(item)) === date);
  const positionedMeetings = layoutMeetingScheduleItems(
    selectedDayItems.map((item) => {
      const time = getShanghaiTimeParts(getMeetingScheduleDate(item));
      return {
        item,
        top: ((time.hour * 60 + time.minute) / 60) * HOUR_HEIGHT,
        height: getScheduleCardHeight(item),
      };
    }),
  );

  useLayoutEffect(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;
    const earliestMinutes = selectedDayItems.length
      ? Math.min(...selectedDayItems.map((item) => getMinutesOfDay(getMeetingScheduleDate(item))))
      : DEFAULT_VISIBLE_HOUR * 60;
    viewport.scrollTop = Math.max(0, ((earliestMinutes - 60) / 60) * HOUR_HEIGHT);
  }, [date, selectedDayItems]);

  return (
    <section
      className="min-h-0 overflow-hidden rounded-3xl border bg-card/80 shadow-sm lg:flex lg:h-full lg:flex-col"
      aria-labelledby="schedule-title"
    >
      <header className="shrink-0 border-b px-5 py-5 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">周一到周日 · UTC+8</p>
            <h2 id="schedule-title" className="mt-1 text-xl font-semibold tracking-tight">
              {formatWeekTitle(days)}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="查看上一周"
              onClick={() => onDateChange(shiftDate(date, -7))}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDateChange(today)}>
              今天
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="查看下一周"
              onClick={() => onDateChange(shiftDate(date, 7))}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        </div>

        <nav className="mt-4 grid grid-cols-7 gap-1" aria-label="选择日程日期">
          {days.map((day, index) => (
            <Button
              key={day}
              type="button"
              variant="ghost"
              aria-pressed={day === date}
              aria-label={`查看${day}的会议`}
              onClick={() => onDateChange(day)}
              className={cn(
                'h-auto min-w-0 flex-col gap-0 rounded-xl py-2 text-center text-muted-foreground',
                day === date && 'bg-meeting-accent-soft text-meeting-accent-foreground',
                day === today && day !== date && 'ring-1 ring-meeting-accent/30',
              )}
            >
              <span className="block truncate text-[10px] sm:text-xs">{WEEK_LABELS[index]}</span>
              <span className="mt-1 block text-sm font-semibold">{Number(day.slice(-2))}</span>
            </Button>
          ))}
        </nav>
      </header>

      <div
        ref={timelineViewportRef}
        className="hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pr-3 md:block sm:px-7 lg:block"
        aria-label={`${date}全天会议时间轴，可纵向滚动查看二十四小时`}
      >
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
          <div className="relative" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }} aria-hidden>
            {hours.map((hour) => (
              <span
                key={hour}
                className="absolute right-0 -translate-y-1/2 text-[10px] font-medium text-muted-foreground tabular-nums"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
              >
                {String(hour).padStart(2, '0')}:00
              </span>
            ))}
          </div>

          <div
            className="relative overflow-hidden rounded-2xl bg-muted/20"
            style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}
          >
            <div className="absolute inset-0" aria-hidden>
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="absolute inset-x-0 border-t border-dashed border-meeting-line"
                  style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                />
              ))}
            </div>
            {positionedMeetings.map((positionedMeeting) => (
              <ScheduleCard key={positionedMeeting.item.id} positionedMeeting={positionedMeeting} onSelect={onSelect} />
            ))}
            {selectedDayItems.length === 0 ? (
              <div className="absolute inset-x-0 top-[26rem] flex flex-col items-center text-center text-muted-foreground">
                <CalendarClock className="size-6" aria-hidden />
                <p className="mt-2 text-sm font-medium">当天暂无会议</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:hidden">
        {selectedDayItems.length === 0 ? (
          <EmptySchedule />
        ) : (
          selectedDayItems.map((item) => (
            <Button
              key={item.id}
              variant="outline"
              className="h-auto justify-start rounded-2xl p-4 text-left"
              onClick={() => onSelect(item)}
            >
              <span>
                <span className="block text-xs text-muted-foreground">{formatMeetingTime(item)}</span>
                <span className="mt-1 block font-medium">{item.title}</span>
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {item.projectTitle} · {item.areaName}
                </span>
                <span className="mt-2 block text-[11px] font-medium text-muted-foreground">
                  {meetingStatusLabel(item.status)}
                </span>
              </span>
            </Button>
          ))
        )}
      </div>
    </section>
  );
}

/** 渲染单日时间轴中的会议块。 */
function ScheduleCard({
  positionedMeeting,
  onSelect,
}: {
  positionedMeeting: PositionedMeeting;
  onSelect: (meeting: MeetingCenterListItem) => void;
}) {
  const { item, top, height, lane, laneCount } = positionedMeeting;
  const scheduleDate = getMeetingScheduleDate(item);
  const time = getShanghaiTimeParts(scheduleDate);
  const left = lane === 0 ? 8 : `calc(${(lane / laneCount) * 100}% + 4px)`;
  const right = lane === laneCount - 1 ? 8 : `calc(${((laneCount - lane - 1) / laneCount) * 100}% + 4px)`;
  return (
    <Button
      variant="outline"
      className={cn(
        'absolute z-10 h-auto min-w-0 items-start justify-start overflow-hidden rounded-xl px-3 py-2 text-left shadow-sm hover:z-20',
        meetingStatusClassName(item.status),
      )}
      style={{ top, height, left, right }}
      onClick={() => onSelect(item)}
      aria-label={`${item.title}，${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}，${meetingStatusLabel(item.status)}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold">{item.title}</span>
        <span className="mt-1 block truncate text-[11px] font-normal opacity-75">
          {String(time.hour).padStart(2, '0')}:{String(time.minute).padStart(2, '0')} ·{' '}
          {item.scheduledDurationMinutes ? `${item.scheduledDurationMinutes} 分钟` : '时长未设置'} ·{' '}
          {meetingStatusLabel(item.status)}
        </span>
      </span>
    </Button>
  );
}

/** 根据计划时长计算会议卡片高度并保留最低可读高度。 */
function getScheduleCardHeight(item: MeetingCenterListItem): number {
  return Math.max(44, Math.min(((item.scheduledDurationMinutes ?? 30) / 60) * HOUR_HEIGHT, 180));
}

/** 渲染移动端单日空状态。 */
function EmptySchedule() {
  return (
    <div className="grid min-h-52 place-items-center px-6 py-10 text-center">
      <div>
        <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-meeting-accent-soft text-meeting-accent-foreground">
          <CalendarClock aria-hidden />
        </span>
        <h3 className="mt-3 font-semibold">当天暂无会议</h3>
        <p className="mt-1 text-sm text-muted-foreground">可选择其他日期查看日程。</p>
      </div>
    </div>
  );
}

/** 创建包含给定日期的周一到周日日期键。 */
function createWeekDays(date: string): string[] {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}
/** 移动日期键。 */
function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
/** 格式化周标题。 */
function formatWeekTitle(days: string[]): string {
  const start = new Date(`${days[0]}T00:00:00.000Z`);
  const end = new Date(`${days[6]}T00:00:00.000Z`);
  return `${start.getUTCMonth() + 1}月${start.getUTCDate()}日 — ${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
}
/** 格式化 UTC+8 日期键。 */
function formatDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
/** 读取 UTC+8 时分。 */
function getShanghaiTimeParts(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);
  return {
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? 0),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? 0),
  };
}
/** 获取 UTC+8 当日分钟数。 */
function getMinutesOfDay(date: Date): number {
  const time = getShanghaiTimeParts(date);
  return time.hour * 60 + time.minute;
}
/** 确定会议在日程中的时间。 */
function getMeetingScheduleDate(item: MeetingCenterListItem): Date {
  return new Date(item.scheduledAt ?? item.startedAt ?? item.createdAt);
}
/** 返回会议状态样式。 */
function meetingStatusClassName(status: MeetingCenterListItem['status']): string {
  if (status === 'CANCELLED') return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (status === 'ENDED') return 'border-border bg-muted text-muted-foreground';
  return 'border-meeting-accent/30 bg-meeting-accent-soft text-meeting-accent-foreground';
}
/** 返回会议状态文案。 */
function meetingStatusLabel(status: MeetingCenterListItem['status']): string {
  return { SCHEDULED: '待开始', LIVE: '进行中', ENDED: '已结束', CANCELLED: '已取消' }[status];
}
/** 格式化移动端会议时间。 */
function formatMeetingTime(item: MeetingCenterListItem): string {
  const kind = item.scheduledAt ? '计划' : item.startedAt ? '实际' : '创建';
  return `${kind} · ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(getMeetingScheduleDate(item))}`;
}
