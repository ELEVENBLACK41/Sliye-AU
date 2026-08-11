/**
 * 本文件组合新版会议中心首页的操作区、日程视图与会议状态概览。
 */
'use client';

import { CalendarDays, Layers3, ListChecks, UserRound } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import { MeetingOverview } from './meeting-overview';
import { MeetingSchedule } from './meeting-schedule';
import { QuickCallPanel } from './quick-call-panel';

/** 渲染尚未接入业务接口的新版会议中心首页。 */
export function MeetingCenterPage() {
  return (
    <section className="flex min-h-0 flex-1 flex-col py-7 sm:py-9" aria-label="会议中心">
      <header className="flex justify-end">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <QuickCallPanel />
          <Button variant="outline" size="lg" disabled className="h-11 rounded-xl px-4">
            <CalendarDays aria-hidden />
            预约会议
            <span className="sr-only">预约会议功能待接入</span>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="schedule" className="mt-5 min-h-0 flex-1 gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList variant="line" className="h-auto gap-2 p-0">
            <TabsTrigger
              value="schedule"
              className="h-10 flex-none rounded-xl border px-4 data-[state=active]:border-meeting-accent data-[state=active]:bg-meeting-accent-soft"
            >
              <CalendarDays aria-hidden />
              我的日程
            </TabsTrigger>
            <TabsTrigger
              value="records"
              className="h-10 flex-none rounded-xl border px-4 data-[state=active]:border-meeting-accent data-[state=active]:bg-meeting-accent-soft"
            >
              <ListChecks aria-hidden />
              会议记录
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <Select defaultValue="all-projects" disabled>
              <SelectTrigger className="w-36 rounded-xl bg-background" aria-label="按项目筛选会议">
                <Layers3 aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-projects">全部项目</SelectItem>
              </SelectContent>
            </Select>
            <Select defaultValue="my-role" disabled>
              <SelectTrigger className="w-36 rounded-xl bg-background" aria-label="按我的角色筛选会议">
                <UserRound aria-hidden />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="my-role">我的角色</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="schedule" className="min-h-0">
          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.75fr)_minmax(20rem,1fr)]">
            <MeetingSchedule />
            <MeetingOverview />
          </div>
        </TabsContent>

        <TabsContent value="records" className="min-h-0">
          <section className="flex min-h-80 items-center justify-center rounded-3xl border bg-card/80 px-6 text-center shadow-sm">
            <div className="max-w-sm">
              <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-meeting-accent-soft text-meeting-accent-foreground">
                <ListChecks aria-hidden />
              </span>
              <h2 className="mt-4 text-lg font-semibold">会议记录将在这里汇总</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                后续确认旧接口的可复用范围后，再接入会议状态、回放与关联决策信息。
              </p>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </section>
  );
}
