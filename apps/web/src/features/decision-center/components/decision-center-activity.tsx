/**
 * 本文件组合决策活动热力图与同页按日过程档案，管理日期选择和按需读取状态。
 */
'use client';

import { useRef, useState } from 'react';
import { Activity, CalendarDays, FileCheck2, Lightbulb, RefreshCw, UsersRound, Vote } from 'lucide-react';
import type {
  DecisionCenterActivityDay,
  DecisionCenterActivityResponse,
  DecisionEventType,
} from '@workspace/contracts/decisions';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

import { getDecisionCenterActivityDay } from '../services/decision-center-client.service';
import { DecisionActivityHeatmap } from './decision-activity-heatmap';

/** 活动区属性。 */
type DecisionCenterActivityProps = {
  /** 服务端首屏活动数据。 */
  activity: DecisionCenterActivityResponse;
};

/** 活动事件对应的图标与语义颜色。 */
const eventMeta: Partial<Record<DecisionEventType, { icon: typeof UsersRound; color: string; label: string }>> = {
  MEETING_STARTED: { icon: UsersRound, color: 'text-decision-meeting', label: '会议' },
  PROPOSAL_CREATED: { icon: Lightbulb, color: 'text-decision-proposal', label: '提案' },
  VOTE_ROUND_OPENED: { icon: Vote, color: 'text-decision-vote', label: '投票' },
  RESOLUTION_CREATED: { icon: FileCheck2, color: 'text-decision-resolution', label: '决议' },
};

/** 渲染作为页面视觉签名的真实活动热力图。 */
export function DecisionCenterActivity({ activity }: DecisionCenterActivityProps) {
  const [selectedDay, setSelectedDay] = useState(activity.initialDay);
  const [loadingDate, setLoadingDate] = useState<string | null>(null);
  const [errorDate, setErrorDate] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const activeDayCount = activity.days.filter((day) => day.eventCount > 0).length;
  const totalEvents = activity.days.reduce((total, day) => total + day.eventCount, 0);

  /** 选择日期后在当前页面按需读取该日档案，并忽略过期响应。 */
  async function handleDateSelect(date: string): Promise<void> {
    if (date === selectedDay.summary.date && !errorDate) return;
    const summary = activity.days.find((day) => day.date === date) ?? emptyDay(date);
    const sequence = ++requestSequence.current;
    setSelectedDay({ summary, events: [] });
    setLoadingDate(date);
    setErrorDate(null);
    try {
      const detail = await getDecisionCenterActivityDay(date);
      if (sequence === requestSequence.current) setSelectedDay(detail);
    } catch {
      if (sequence === requestSequence.current) setErrorDate(date);
    } finally {
      if (sequence === requestSequence.current) setLoadingDate(null);
    }
  }

  return (
    <section aria-labelledby="decision-activity-title" className="grid gap-3">
      <Card className="overflow-hidden rounded-[1.75rem] border-border/70 bg-decision-surface py-0 shadow-none backdrop-blur-sm">
        <CardHeader className="gap-0 border-b px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-decision-accent" aria-hidden />
                <CardTitle id="decision-activity-title" className="text-base text-decision-ink">决策活动热力图</CardTitle>
              </div>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                过去一年会议、提案、投票与正式决议的发生密度；选择一天可在本页查看过程档案。
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>活跃 <strong className="text-decision-ink">{activeDayCount}</strong> 天</span>
              <span>关键记录 <strong className="text-decision-ink">{totalEvents}</strong> 条</span>
              <Badge variant="outline" className="rounded-full bg-background/40">过去一年</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 px-5 py-5 sm:px-6 xl:grid-cols-[minmax(0,1fr)_15rem]">
          <DecisionActivityHeatmap
            days={activity.days}
            selectedDate={selectedDay.summary.date}
            onDateSelect={handleDateSelect}
          />
          <ActivityDaySummary day={selectedDay.summary} />
        </CardContent>
      </Card>

      <Card className="rounded-[1.5rem] border-border/70 bg-background/55 py-0 shadow-none backdrop-blur-sm">
        <CardHeader className="flex-row items-center justify-between px-5 pt-5 pb-3 sm:px-6">
          <div>
            <CardTitle className="text-sm">{formatDate(selectedDay.summary.date)} · 当日过程</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">按发生时间倒序，仅呈现四类关键过程记录。</p>
          </div>
          {errorDate ? (
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => handleDateSelect(errorDate)}>
              <RefreshCw aria-hidden />重试
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6">
          {loadingDate ? <ActivityEventsSkeleton /> : errorDate ? (
            <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">当日档案暂时无法加载，请重试。</p>
          ) : selectedDay.events.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">这一天没有会议、提案、投票或决议记录。</p>
          ) : (
            <ol className="grid gap-2">
              {selectedDay.events.map((event) => {
                const meta = eventMeta[event.type] ?? eventMeta.PROPOSAL_CREATED!;
                const Icon = meta.icon;
                return (
                  <li key={event.id} className="grid gap-3 rounded-2xl border bg-background/45 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                    <span className={`grid size-8 place-items-center rounded-full bg-muted ${meta.color}`}><Icon className="size-4" aria-hidden /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{event.title}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{event.decision.projectTitle} · {event.decision.title}</p>
                    </div>
                    <div className="text-left text-xs text-muted-foreground sm:text-right">
                      <p>{meta.label}</p>
                      <time dateTime={event.occurredAt}>{formatTime(event.occurredAt)}</time>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** 渲染选中日期的四类统计。 */
function ActivityDaySummary({ day }: { day: DecisionCenterActivityDay }) {
  return (
    <aside className="rounded-2xl border bg-background/35 p-4" aria-live="polite">
      <div className="flex items-center gap-2 text-muted-foreground">
        <CalendarDays className="size-4" aria-hidden />
        <p className="text-xs">{formatDate(day.date)}</p>
      </div>
      <p className="mt-3 text-2xl font-medium tracking-tight text-decision-ink">
        {day.decisionCount}<span className="ml-1.5 text-xs font-normal text-muted-foreground">项相关决策</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">记录 {day.eventCount} 个关键事件</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-xs">
        <ActivityCount label="会议" value={day.meetingCount} color="bg-decision-meeting" />
        <ActivityCount label="提案" value={day.proposalCount} color="bg-decision-proposal" />
        <ActivityCount label="投票" value={day.voteCount} color="bg-decision-vote" />
        <ActivityCount label="决议" value={day.resolutionCount} color="bg-decision-resolution" />
      </dl>
    </aside>
  );
}

/** 渲染选中日期的一类活动数量。 */
function ActivityCount({ label, value, color }: { label: string; value: number; color: string }) {
  return <div><dt className="flex items-center gap-1.5 text-muted-foreground"><span className={`size-1.5 rounded-full ${color}`} />{label}</dt><dd className="mt-1 font-medium text-decision-ink">{value}</dd></div>;
}

/** 渲染按日档案的局部加载状态。 */
function ActivityEventsSkeleton() {
  return <div className="grid gap-2" aria-label="正在加载当日过程"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div>;
}

/** 创建无事件日期的即时摘要。 */
function emptyDay(date: string): DecisionCenterActivityDay {
  return { date, decisionCount: 0, eventCount: 0, meetingCount: 0, proposalCount: 0, voteCount: 0, resolutionCount: 0 };
}

/** 格式化业务日期键。 */
function formatDate(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00.000Z`));
}

/** 格式化事件时刻。 */
function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
