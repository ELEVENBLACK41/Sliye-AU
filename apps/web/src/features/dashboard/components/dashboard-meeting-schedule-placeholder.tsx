/**
 * 本文件展示新版工作台的单日会议时间轴，当前使用静态数据预览布局，后续可替换为会议接口数据。
 */
'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, Clock3, MapPin } from 'lucide-react';

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';

/** 单位小时在时间轴中占据的垂直高度。 */
const HOUR_HEIGHT = 40;

/** 时间轴从当天零点开始展示。 */
const SCHEDULE_START_HOUR = 0;

/** 时间轴展示完整的二十四小时。 */
const SCHEDULE_END_HOUR = 24;

/** 时间轴容器一次展示六个小时。 */
const VISIBLE_HOUR_COUNT = 6;

/** 星期列的静态日期信息，后续由接口查询日期范围替换。 */
const scheduleDays = [
  { key: 'monday', label: '周一', date: '27', isToday: false },
  { key: 'tuesday', label: '周二', date: '28', isToday: false },
  { key: 'wednesday', label: '周三', date: '29', isToday: false },
  { key: 'thursday', label: '周四', date: '30', isToday: true },
  { key: 'friday', label: '周五', date: '31', isToday: false },
  { key: 'saturday', label: '周六', date: '01', isToday: false },
  { key: 'sunday', label: '周日', date: '02', isToday: false },
] as const;

/** 工作台会议参与人的静态展示结构。 */
type MeetingParticipantPlaceholder = {
  /** 参与人唯一标识。 */
  id: string;
  /** 参与人姓名。 */
  name: string;
  /** 无图片时使用的头像背景色。 */
  colorClassName: string;
};

/** 工作台会议时间轴使用的静态会议结构。 */
type DashboardMeetingPlaceholder = {
  /** 会议唯一标识。 */
  id: string;
  /** 会议名称。 */
  title: string;
  /** 会议补充说明。 */
  description: string;
  /** 会议所在星期列，从星期一开始计数。 */
  dayIndex: number;
  /** 会议开始时间，使用 24 小时制 HH:mm。 */
  startTime: string;
  /** 会议持续分钟数，用于展示会议结束时间。 */
  durationMinutes: number;
  /** 会议地点或线上会议说明。 */
  location: string;
  /** 当前用户是否为会议发起人。 */
  isOwned: boolean;
  /** 会议参与人列表。 */
  participants: MeetingParticipantPlaceholder[];
};

/** 会议时间轴的静态占位数据，后续由工作台会议接口返回值替换。 */
const meetingScheduleData: DashboardMeetingPlaceholder[] = [
  {
    id: 'weekly-product-sync',
    title: '产品方向周会',
    description: '同步本周议题与待确认方向',
    dayIndex: 0,
    startTime: '09:00',
    durationMinutes: 60,
    location: '线上会议',
    isOwned: true,
    participants: [
      { id: 'chen-shuai', name: '陈帅', colorClassName: 'bg-[#efbc58]' },
      { id: 'lin-ning', name: '林宁', colorClassName: 'bg-[#d7c7b7]' },
      { id: 'zhou-yu', name: '周宇', colorClassName: 'bg-[#8ea6a0]' },
      { id: 'liu-xin', name: '刘欣', colorClassName: 'bg-[#c7a9a0]' },
    ],
  },
  {
    id: 'mobile-framework-review',
    title: '移动端技术方案评审',
    description: '确认首期技术选型与风险',
    dayIndex: 1,
    startTime: '13:30',
    durationMinutes: 90,
    location: '第三会议室',
    isOwned: false,
    participants: [
      { id: 'wang-yan', name: '王岩', colorClassName: 'bg-[#90a6c0]' },
      { id: 'chen-shuai', name: '陈帅', colorClassName: 'bg-[#efbc58]' },
      { id: 'sun-ke', name: '孙可', colorClassName: 'bg-[#b6a5cc]' },
    ],
  },
  {
    id: 'ai-minutes-workshop',
    title: 'AI 会议纪要讨论',
    description: '梳理准确性与隐私边界',
    dayIndex: 3,
    startTime: '10:30',
    durationMinutes: 120,
    location: '线上会议',
    isOwned: true,
    participants: [
      { id: 'chen-shuai', name: '陈帅', colorClassName: 'bg-[#efbc58]' },
      { id: 'he-qing', name: '何青', colorClassName: 'bg-[#d69b9b]' },
      { id: 'lin-ning', name: '林宁', colorClassName: 'bg-[#d7c7b7]' },
      { id: 'zhou-yu', name: '周宇', colorClassName: 'bg-[#8ea6a0]' },
      { id: 'sun-ke', name: '孙可', colorClassName: 'bg-[#b6a5cc]' },
    ],
  },
  {
    id: 'decision-replay-review',
    title: '决策回放体验评审',
    description: '确认时间线回放的交互细节',
    dayIndex: 4,
    startTime: '15:00',
    durationMinutes: 45,
    location: '设计评审室',
    isOwned: false,
    participants: [
      { id: 'liu-xin', name: '刘欣', colorClassName: 'bg-[#c7a9a0]' },
      { id: 'wang-yan', name: '王岩', colorClassName: 'bg-[#90a6c0]' },
    ],
  },
];

/** 时间轴左侧需要显示的整点刻度。 */
const scheduleHours = Array.from(
  { length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR + 1 },
  (_, index) => SCHEDULE_START_HOUR + index,
);

/** 将 HH:mm 格式转换为从当天零点开始计算的分钟数。 */
function parseTimeToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** 将分钟数格式化为会议结束时间。 */
function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const remainderMinutes = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${remainderMinutes.toString().padStart(2, '0')}`;
}

/** 提取参与人姓名中的尾字作为头像缩写。 */
function getParticipantInitial(name: string): string {
  return name.slice(-1);
}

/** 根据会议开始时间计算其在纵向时间轴中的位置。 */
function getMeetingTop(startTime: string): number {
  const startMinutes = parseTimeToMinutes(startTime);
  return (startMinutes / 60) * HOUR_HEIGHT;
}

/** 根据会议名称的视觉长度计算卡片宽度，并为右侧参与人头像预留稳定空间。 */
function getMeetingWidth(title: string): number {
  const visualCharacterCount = Array.from(title).reduce(
    (total, character) => total + (character.charCodeAt(0) > 255 ? 1 : 0.58),
    0,
  );

  return Math.min(Math.max(Math.ceil(visualCharacterCount * 14) + 150, 240), 480);
}

/** 渲染会议参与人的重叠头像，最多展示三人，其余人数使用计数头像表示。 */
function MeetingParticipantAvatars({ participants }: { participants: MeetingParticipantPlaceholder[] }) {
  const visibleParticipants = participants.slice(0, 3);
  const hiddenParticipantCount = participants.length - visibleParticipants.length;

  return (
    <AvatarGroup className="ml-auto shrink-0 -space-x-2.5 *:data-[slot=avatar]:ring-[2px] *:data-[slot=avatar]:ring-white/90">
      {visibleParticipants.map((participant) => (
        <Avatar key={participant.id} size="sm" title={participant.name}>
          <AvatarFallback className={`${participant.colorClassName} text-[10px] font-semibold text-[#292a27]`}>
            {getParticipantInitial(participant.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {hiddenParticipantCount > 0 ? (
        <AvatarGroupCount className="size-6 bg-[#292a27] text-[9px] text-white ring-white/90">
          +{hiddenParticipantCount}
        </AvatarGroupCount>
      ) : null}
    </AvatarGroup>
  );
}

/** 渲染时间轴中的单个会议卡片。 */
function MeetingScheduleItem({ meeting }: { meeting: DashboardMeetingPlaceholder }) {
  const startMinutes = parseTimeToMinutes(meeting.startTime);
  const endTime = formatMinutesAsTime(startMinutes + meeting.durationMinutes);
  const eventStyle = {
    left: '12px',
    maxWidth: 'calc(100% - 24px)',
    top: `${getMeetingTop(meeting.startTime)}px`,
    width: `${getMeetingWidth(meeting.title)}px`,
  };

  return (
    <li
      className={`absolute z-10 h-[52px] min-w-48 overflow-hidden rounded-[1.1rem] border px-3 py-2 shadow-sm transition-transform hover:z-20 hover:-translate-y-0.5 ${
        meeting.isOwned
          ? 'border-[#292a27] bg-[#292a27] text-white'
          : 'border-black/5 bg-white/95 text-[#292a27]'
      }`}
      style={eventStyle}
      aria-label={`${meeting.title}，${meeting.startTime} 至 ${endTime}，${meeting.location}`}
    >
      <div className="flex h-full min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-xs font-semibold">{meeting.title}</p>
          <p className={`mt-1 truncate text-[10px] ${meeting.isOwned ? 'text-white/52' : 'text-black/42'}`}>
            {meeting.startTime}–{endTime} · {meeting.description}
          </p>
        </div>
        <MeetingParticipantAvatars participants={meeting.participants} />
      </div>
    </li>
  );
}

/** 单日会议时间轴的交互属性。 */
type MeetingScheduleTimelineProps = {
  /** 当前选中的星期索引。 */
  selectedDayIndex: number;
  /** 切换选中日期。 */
  onDaySelect: (dayIndex: number) => void;
};

/** 渲染可选择星期、可滚动二十四小时的单日会议时间轴。 */
function MeetingScheduleTimeline({ selectedDayIndex, onDaySelect }: MeetingScheduleTimelineProps) {
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const visibleMeetings = meetingScheduleData.filter((meeting) => meeting.dayIndex === selectedDayIndex);
  const timelineHeight = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * HOUR_HEIGHT;
  const timelineViewportHeight = VISIBLE_HOUR_COUNT * HOUR_HEIGHT;

  useLayoutEffect(() => {
    const timelineViewport = timelineViewportRef.current;
    if (!timelineViewport) return;

    const selectedMeetings = meetingScheduleData.filter((meeting) => meeting.dayIndex === selectedDayIndex);
    const earliestMeetingMinutes = selectedMeetings.length
      ? Math.min(...selectedMeetings.map((meeting) => parseTimeToMinutes(meeting.startTime)))
      : 8 * 60;
    const scrollStartMinutes = Math.max(earliestMeetingMinutes - 60, 0);
    timelineViewport.scrollTop = (scrollStartMinutes / 60) * HOUR_HEIGHT;
  }, [selectedDayIndex]);

  return (
    <div className=" pb-1">
      <div className="min-w-[32rem]">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
          <div className="flex items-end pb-2 text-[10px] font-medium text-black/35">
            <Clock3 className="mr-1 size-3" aria-hidden />
            时间
          </div>
          <div
            className="grid border-b border-dashed border-black/10 pb-2"
            style={{ gridTemplateColumns: `repeat(${scheduleDays.length}, minmax(0, 1fr))` }}
          >
            {scheduleDays.map((day, dayIndex) => {
              const isSelected = selectedDayIndex === dayIndex;

              return (
                <Button
                  key={day.key}
                  type="button"
                  variant="ghost"
                  className="h-auto min-w-0 flex-col gap-1 rounded-xl px-1 py-1 text-[#292a27] hover:bg-white/55"
                  aria-pressed={isSelected}
                  aria-label={`查看${day.label} ${day.date}日的会议`}
                  onClick={() => onDaySelect(dayIndex)}
                >
                  <span className="block text-[10px] font-medium text-black/38">{day.label}</span>
                  <span
                    className={`mx-auto mt-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isSelected
                        ? 'bg-[#292a27] text-white'
                        : day.isToday
                          ? 'bg-[#ffd653] text-[#292a27]'
                          : 'text-[#292a27]'
                    }`}
                  >
                    {day.date}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>

        <div
          ref={timelineViewportRef}
          className="mt-2 overflow-y-auto overscroll-contain pr-1"
          style={{ height: `${timelineViewportHeight}px` }}
          aria-label="全天会议时间轴，可纵向滚动查看二十四小时"
        >
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
            <div className="relative" style={{ height: `${timelineHeight}px` }} aria-hidden>
              {scheduleHours.map((hour) => (
                <span
                  key={hour}
                  className="absolute right-0 -translate-y-1/2 text-[10px] font-medium text-black/42 tabular-nums"
                  style={{ top: `${(hour - SCHEDULE_START_HOUR) * HOUR_HEIGHT}px` }}
                >
                  {hour.toString().padStart(2, '0')}:00
                </span>
              ))}
            </div>

            <div className="relative overflow-hidden rounded-2xl" style={{ height: `${timelineHeight}px` }}>
              <div className="absolute inset-0" aria-hidden>
                {scheduleHours.map((hour) => (
                  <span
                    key={hour}
                    className="absolute inset-x-0 border-t border-dashed border-black/[0.06]"
                    style={{ top: `${(hour - SCHEDULE_START_HOUR) * HOUR_HEIGHT}px` }}
                  />
                ))}
              </div>

              <ul className="absolute inset-0" aria-label={`${scheduleDays[selectedDayIndex]?.label ?? ''}会议`}>
                {visibleMeetings.map((meeting) => (
                  <MeetingScheduleItem key={meeting.id} meeting={meeting} />
                ))}
              </ul>

              {visibleMeetings.length === 0 ? (
                <div className="absolute inset-x-0 top-[20rem] flex flex-col items-center justify-center text-black/35">
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

/** 渲染工作台会议日程卡片，并管理顶部星期选择状态。 */
export function DashboardMeetingSchedulePlaceholder() {
  const defaultDayIndex = scheduleDays.findIndex((day) => day.isToday);
  const [selectedDayIndex, setSelectedDayIndex] = useState(defaultDayIndex === -1 ? 0 : defaultDayIndex);

  /** 切换时间轴当前展示的日期。 */
  function handleDaySelect(dayIndex: number): void {
    setSelectedDayIndex(dayIndex);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 xl:gap-[clamp(0.5rem,calc(1.8cqh+0.405rem),1rem)]">
      <div>
        <h2 className="text-xl font-medium tracking-tight text-[#292a27] xl:text-[clamp(1.125rem,calc(2.2cqh+0.495rem),1.25rem)]">
          我的会议
        </h2>
        <p className="mt-1 flex items-center gap-1 text-xs text-black/40">
          <MapPin className="size-3" aria-hidden />
          2026年7月27日—8月2日
        </p>
      </div>

      <MeetingScheduleTimeline selectedDayIndex={selectedDayIndex} onDaySelect={handleDaySelect} />
    </div>
  );
}
