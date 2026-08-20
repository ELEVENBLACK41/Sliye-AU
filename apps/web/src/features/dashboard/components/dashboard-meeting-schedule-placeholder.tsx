/**
 * 本文件使用会议中心同一份周概览数据展示工作台单日会议时间线。
 */
'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Clock3, MapPin, UsersRound } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';
import type { DashboardMeetingScheduleItem } from '../types/dashboard.types';

/** 单位小时在时间轴中占据的垂直高度。 */
const HOUR_HEIGHT = 40;
/** 时间轴从当天零点开始展示。 */
const SCHEDULE_START_HOUR = 0;
/** 时间轴展示完整的二十四小时。 */
const SCHEDULE_END_HOUR = 24;
/** 时间轴容器一次展示六个小时。 */
const VISIBLE_HOUR_COUNT = 6;
/** 当天没有会议时默认从八点开始展示。 */
const DEFAULT_VISIBLE_HOUR = 8;
/** 周一到周日的中文短名。 */
const WEEK_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 工作台会议时间线属性。 */
type DashboardMeetingSchedulePlaceholderProps = {
  /** 当前周选择所依据的 UTC+8 日期键。 */
  date: string;
  /** 会议中心周概览映射出的最小日程摘要。 */
  meetings: DashboardMeetingScheduleItem[];
};

/** 时间线中已完成重叠分栏的一场会议。 */
type PositionedDashboardMeeting = {
  /** 会议中心摘要。 */
  item: DashboardMeetingScheduleItem;
  /** 相对时间轴顶部的像素距离。 */
  top: number;
  /** 会议卡片可视高度。 */
  height: number;
  /** 当前会议所在的零基轨道。 */
  lane: number;
  /** 当前重叠组需要的总轨道数。 */
  laneCount: number;
};

/** 时间轴左侧需要显示的整点刻度。 */
const scheduleHours = Array.from(
  { length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1 },
  (_, index) => SCHEDULE_START_HOUR + index,
);

/** 渲染可选择星期、可滚动二十四小时的真实会议时间轴。 */
function MeetingScheduleTimeline({
  days,
  meetings,
  selectedDate,
  onDaySelect,
}: {
  /** 当前周日期键。 */
  days: string[];
  /** 当前周会议中心日程。 */
  meetings: DashboardMeetingScheduleItem[];
  /** 当前选中日期键。 */
  selectedDate: string;
  /** 切换选中日期。 */
  onDaySelect: (date: string) => void;
}) {
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const visibleMeetings = useMemo(
    () => meetings.filter((meeting) => formatShanghaiDate(getMeetingScheduleDate(meeting)) === selectedDate),
    [meetings, selectedDate],
  );
  const positionedMeetings = useMemo(() => layoutMeetings(visibleMeetings), [visibleMeetings]);
  const timelineHeight = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * HOUR_HEIGHT;
  const timelineViewportHeight = VISIBLE_HOUR_COUNT * HOUR_HEIGHT;
  const today = formatShanghaiDate(new Date());

  useLayoutEffect(() => {
    const timelineViewport = timelineViewportRef.current;
    if (!timelineViewport) return;
    const earliestMeetingMinutes = visibleMeetings.length
      ? Math.min(...visibleMeetings.map((meeting) => getMinutesOfDay(getMeetingScheduleDate(meeting))))
      : DEFAULT_VISIBLE_HOUR * 60;
    const scrollStartMinutes = Math.max(earliestMeetingMinutes - 60, 0);
    timelineViewport.scrollTop = (scrollStartMinutes / 60) * HOUR_HEIGHT;
  }, [selectedDate, visibleMeetings]);

  return (
    <div className="overflow-x-auto pb-1">
      <div className="min-w-[32rem]">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
          <div className="flex items-end pb-2 text-[10px] font-medium text-muted-foreground">
            <Clock3 className="mr-1 size-3" aria-hidden />
            时间
          </div>
          <div className="grid grid-cols-7 border-b border-dashed border-border pb-2">
            {days.map((day, index) => {
              const isSelected = selectedDate === day;
              const isToday = today === day;
              return (
                <Button
                  key={day}
                  type="button"
                  variant="ghost"
                  className="h-auto min-w-0 flex-col gap-1 rounded-xl px-1 py-1 text-foreground hover:bg-background/55"
                  aria-pressed={isSelected}
                  aria-label={`查看${WEEK_LABELS[index]} ${Number(day.slice(-2))}日的会议`}
                  onClick={() => onDaySelect(day)}
                >
                  <span className="block text-[10px] font-medium text-muted-foreground">{WEEK_LABELS[index]}</span>
                  <span
                    className={cn(
                      'mx-auto mt-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold',
                      isSelected && 'bg-decision-panel text-primary-foreground',
                      isToday && !isSelected && 'bg-meeting-accent text-meeting-accent-foreground',
                    )}
                  >
                    {Number(day.slice(-2))}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        <div
          ref={timelineViewportRef}
          className="mt-2 overflow-y-auto overscroll-contain pr-1"
          style={{ height: timelineViewportHeight }}
          aria-label="全天会议时间轴，可纵向滚动查看二十四小时"
        >
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
            <div className="relative" style={{ height: timelineHeight }} aria-hidden>
              {scheduleHours.map((hour) => (
                <span
                  key={hour}
                  className="absolute right-0 -translate-y-1/2 text-[10px] font-medium text-muted-foreground tabular-nums"
                  style={{ top: (hour - SCHEDULE_START_HOUR) * HOUR_HEIGHT }}
                >
                  {hour.toString().padStart(2, '0')}:00
                </span>
              ))}
            </div>

            <div className="relative overflow-hidden rounded-2xl bg-muted/20" style={{ height: timelineHeight }}>
              <div className="absolute inset-0" aria-hidden>
                {scheduleHours.map((hour) => (
                  <span
                    key={hour}
                    className="absolute inset-x-0 border-t border-dashed border-meeting-line"
                    style={{ top: (hour - SCHEDULE_START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}
              </div>
              <ul className="absolute inset-0" aria-label={`${selectedDate}会议`}>
                {positionedMeetings.map((meeting) => (
                  <MeetingScheduleItem key={meeting.item.id} meeting={meeting} selectedDate={selectedDate} />
                ))}
              </ul>
              {visibleMeetings.length === 0 ? (
                <div className="absolute inset-x-0 top-[8rem] flex flex-col items-center justify-center text-muted-foreground">
                  <CalendarDays className="size-6" aria-hidden />
                  <p className="mt-2 text-xs font-medium">当天暂无会议安排</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 渲染时间轴中一场可进入会议中心详情的真实会议。 */
function MeetingScheduleItem({
  meeting,
  selectedDate,
}: {
  /** 已完成分栏的位置数据。 */
  meeting: PositionedDashboardMeeting;
  /** 会议中心详情返回时使用的日期键。 */
  selectedDate: string;
}) {
  const { item, top, height, lane, laneCount } = meeting;
  const time = getShanghaiTimeParts(getMeetingScheduleDate(item));
  const startTime = `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
  const left = lane === 0 ? 8 : `calc(${(lane / laneCount) * 100}% + 4px)`;
  const right = lane === laneCount - 1 ? 8 : `calc(${((laneCount - lane - 1) / laneCount) * 100}% + 4px)`;

  return (
    <li className="absolute z-10 min-w-0" style={{ top, height, left, right }}>
      <Link
        href={`/meetings?date=${selectedDate}&meetingId=${item.id}`}
        className={cn(
          'flex h-full min-w-0 items-center gap-2 overflow-hidden rounded-xl border px-3 py-2 shadow-sm transition-transform hover:z-20 hover:-translate-y-0.5',
          meetingStatusClassName(item.status),
        )}
        aria-label={`${item.title}，${startTime}，${meetingStatusLabel(item.status)}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold">{item.title}</span>
          <span className="mt-1 block truncate text-[10px] opacity-65">
            {startTime} · {item.projectTitle ?? '独立会议'} · {item.areaName ?? '仅受邀人可见'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[10px] opacity-70">
          <UsersRound className="size-3" aria-hidden />
          {item.participantCount}
        </span>
      </Link>
    </li>
  );
}

/** 渲染工作台会议日程卡片，并管理顶部星期选择状态。 */
export function DashboardMeetingSchedulePlaceholder({ date, meetings }: DashboardMeetingSchedulePlaceholderProps) {
  const days = createWeekDays(date);
  const [selectedDate, setSelectedDate] = useState(() => (days.includes(date) ? date : days[0]));

  /** 切换时间轴当前展示的日期。 */
  function handleDaySelect(nextDate: string): void {
    setSelectedDate(nextDate);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <h2 className="text-xl font-medium tracking-tight text-foreground">我的会议</h2>
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" aria-hidden />
          {formatWeekTitle(days)} · 与会议中心同步
        </p>
      </div>
      <MeetingScheduleTimeline
        days={days}
        meetings={meetings}
        selectedDate={selectedDate}
        onDaySelect={handleDaySelect}
      />
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

/** 将周一与周日格式化为工作台标题。 */
function formatWeekTitle(days: string[]): string {
  const start = new Date(`${days[0]}T00:00:00.000Z`);
  const end = new Date(`${days[6]}T00:00:00.000Z`);
  return `${start.getUTCFullYear()}年${start.getUTCMonth() + 1}月${start.getUTCDate()}日—${end.getUTCMonth() + 1}月${end.getUTCDate()}日`;
}

/** 将任意时刻格式化为中国标准时间日期键。 */
function formatShanghaiDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

/** 读取任意时刻在中国标准时间中的时分。 */
function getShanghaiTimeParts(value: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(value);
  return {
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? 0),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? 0),
  };
}

/** 获取会议中心统一回退规则下的日程时间。 */
function getMeetingScheduleDate(item: DashboardMeetingScheduleItem): Date {
  return new Date(item.scheduledAt ?? item.startedAt ?? item.createdAt);
}

/** 获取会议在中国标准时间当天已经过去的分钟数。 */
function getMinutesOfDay(value: Date): number {
  const time = getShanghaiTimeParts(value);
  return time.hour * 60 + time.minute;
}

/** 根据计划时长计算卡片高度并保留最低可读高度。 */
function getMeetingHeight(item: DashboardMeetingScheduleItem): number {
  return Math.max(44, Math.min(((item.scheduledDurationMinutes ?? 30) / 60) * HOUR_HEIGHT, 120));
}

/** 将同一时段发生视觉重叠的会议分配到并排轨道。 */
function layoutMeetings(items: DashboardMeetingScheduleItem[]): PositionedDashboardMeeting[] {
  const inputs = items
    .map((item) => ({
      item,
      top: (getMinutesOfDay(getMeetingScheduleDate(item)) / 60) * HOUR_HEIGHT,
      height: getMeetingHeight(item),
    }))
    .sort((left, right) => left.top - right.top || left.item.id - right.item.id);
  const result: PositionedDashboardMeeting[] = [];
  let cluster: typeof inputs = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  /** 完成当前连续重叠组的轨道分配。 */
  function flushCluster(): void {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((input) => {
      let lane = laneEnds.findIndex((end) => end <= input.top);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = input.top + input.height;
      return { ...input, lane };
    });
    result.push(...assigned.map((item) => ({ ...item, laneCount: laneEnds.length })));
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  }

  inputs.forEach((input) => {
    if (cluster.length > 0 && input.top >= clusterEnd) flushCluster();
    cluster.push(input);
    clusterEnd = Math.max(clusterEnd, input.top + input.height);
  });
  flushCluster();
  return result;
}

/** 返回会议状态对应的语义化样式。 */
function meetingStatusClassName(status: DashboardMeetingScheduleItem['status']): string {
  if (status === 'CANCELLED') return 'border-destructive/30 bg-destructive/10 text-destructive';
  if (status === 'EXPIRED') return 'border-muted-foreground/20 bg-muted/70 text-muted-foreground';
  if (status === 'ENDED') return 'border-border bg-muted text-muted-foreground';
  if (status === 'LIVE') return 'border-decision-resolution/30 bg-decision-resolution/15 text-foreground';
  return 'border-meeting-accent/30 bg-meeting-accent-soft text-meeting-accent-foreground';
}

/** 返回会议状态中文文案。 */
function meetingStatusLabel(status: DashboardMeetingScheduleItem['status']): string {
  return {
    SCHEDULED: '待开始',
    LIVE: '进行中',
    ENDED: '已结束',
    CANCELLED: '已取消',
    EXPIRED: '已过期',
  }[status];
}
