/**
 * 本文件组合新版会议中心的 URL 筛选、真实日程、历史记录和详情抽屉。
 */
'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Layers3, ListChecks, UserRound } from 'lucide-react';
import type {
  MeetingCenterListItem,
  MeetingCenterOverviewResponse,
  MeetingCenterRecordsResponse,
} from '@workspace/contracts/meetings';

import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import type {
  MeetingCenterPageQuery,
  MeetingCenterProjectOption,
  MeetingCenterView,
} from '../types/meeting-center.types';
import { formatShanghaiDate } from '../utils/meeting-center-query';
import { MeetingDetailSheet } from './meeting-detail-sheet';
import { MeetingOverview } from './meeting-overview';
import { MeetingRecords } from './meeting-records';
import { MeetingSchedule } from './meeting-schedule';
import { QuickCallPanel } from './quick-call-panel';
import { AppointmentMeetingPanel } from './appointment-meeting-panel';

/** 会议中心组合页属性。 */
type MeetingCenterPageProps = {
  /** URL 解析后的查询状态。 */
  query: MeetingCenterPageQuery;
  /** 项目筛选选项。 */
  projects: MeetingCenterProjectOption[];
  /** 日程视图数据。 */
  overview?: MeetingCenterOverviewResponse;
  /** 记录视图数据。 */
  records?: MeetingCenterRecordsResponse;
};

/** 渲染 URL 驱动的新版会议中心首页。 */
export function MeetingCenterPage({ query, projects, overview, records }: MeetingCenterPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingCenterListItem | null>(() => {
    if (!query.meetingId) return null;
    return (
      records?.items.find((meeting) => meeting.id === query.meetingId) ??
      overview?.calendarItems.find((meeting) => meeting.id === query.meetingId) ??
      overview?.activeMeetings.find((meeting) => meeting.id === query.meetingId) ??
      overview?.upcomingMeetings.find((meeting) => meeting.id === query.meetingId) ??
      null
    );
  });

  /** 合并查询条件并触发服务端重新取数。 */
  function updateQuery(changes: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === undefined || value === '') params.delete(key);
      else params.set(key, String(value));
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  /** 切换日程或记录视图并重置分页。 */
  function handleViewChange(value: string) {
    updateQuery({ view: value as MeetingCenterView, page: undefined });
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col py-7 sm:py-9 lg:h-full lg:overflow-hidden lg:py-6"
      aria-label="会议中心"
    >
      <header className="flex justify-end">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <QuickCallPanel projects={projects} />
          <AppointmentMeetingPanel projects={projects} />
        </div>
      </header>

      <Tabs
        value={query.view}
        onValueChange={handleViewChange}
        className="mt-5 min-h-0 flex-1 gap-5 lg:overflow-hidden"
      >
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
            <Select
              value={query.projectId ? String(query.projectId) : 'all'}
              onValueChange={(value) =>
                updateQuery({ projectId: value === 'all' ? undefined : value, page: undefined })
              }
            >
              <SelectTrigger className="w-40 rounded-xl bg-background" aria-label="按项目筛选会议">
                <Layers3 aria-hidden />
                <SelectValue placeholder="全部项目" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={query.role ?? 'all'}
              onValueChange={(value) => updateQuery({ role: value === 'all' ? undefined : value, page: undefined })}
            >
              <SelectTrigger className="w-36 rounded-xl bg-background" aria-label="按我的角色筛选会议">
                <UserRound aria-hidden />
                <SelectValue placeholder="全部角色" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                <SelectItem value="HOST">我主持的</SelectItem>
                <SelectItem value="CO_HOST">我协助的</SelectItem>
                <SelectItem value="ATTENDEE">我受邀的</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="schedule" className="min-h-0 lg:flex-1 lg:overflow-hidden">
          {overview ? (
            <div className="grid min-h-0 gap-4 lg:h-full lg:grid-cols-[minmax(0,1.75fr)_minmax(20rem,1fr)] lg:overflow-hidden">
              <MeetingSchedule
                date={query.date}
                items={overview.calendarItems}
                onDateChange={(date) => updateQuery({ date })}
                onSelect={setSelectedMeeting}
              />
              <MeetingOverview data={overview} onSelect={setSelectedMeeting} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="records" className="min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {records ? (
            <MeetingRecords
              query={query}
              data={records}
              searchSlot={
                <Input
                  defaultValue={query.keyword ?? ''}
                  placeholder="搜索会议、项目或分区"
                  className="max-w-sm rounded-xl"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter')
                      updateQuery({ keyword: event.currentTarget.value.trim() || undefined, page: undefined });
                  }}
                />
              }
              dateRangeSlot={
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    aria-label="记录开始日期"
                    value={query.from ?? ''}
                    onChange={(event) =>
                      updateQuery({
                        from: event.target.value || undefined,
                        page: undefined,
                      })
                    }
                    className="w-36 rounded-xl"
                  />
                  <span className="text-xs text-muted-foreground">至</span>
                  <Input
                    type="date"
                    aria-label="记录结束日期"
                    value={query.to ?? ''}
                    onChange={(event) =>
                      updateQuery({
                        to: event.target.value || undefined,
                        page: undefined,
                      })
                    }
                    className="w-36 rounded-xl"
                  />
                </div>
              }
              onStatusChange={(status) => updateQuery({ status, page: undefined })}
              onPageChange={(page) => updateQuery({ page })}
              onSelect={setSelectedMeeting}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      <MeetingDetailSheet
        meeting={selectedMeeting}
        open={selectedMeeting !== null}
        onShowInSchedule={
          query.view === 'records' && selectedMeeting
            ? () => {
                const meetingDate = new Date(
                  selectedMeeting.scheduledAt ?? selectedMeeting.startedAt ?? selectedMeeting.createdAt,
                );
                setSelectedMeeting(null);
                updateQuery({ view: 'schedule', date: formatShanghaiDate(meetingDate), page: undefined });
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMeeting(null);
            if (query.meetingId) updateQuery({ meetingId: undefined });
          }
        }}
      />
    </section>
  );
}
