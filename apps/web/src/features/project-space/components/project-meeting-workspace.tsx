/**
 * 本文件展示当前项目的真实会议摘要，并衔接已有会议房间与记录。
 */
import Link from 'next/link';
import { CalendarDays, Radio, UsersRound, Video } from 'lucide-react';
import type { MeetingSummary } from '@workspace/contracts/meetings';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';

/** 项目会议工作区属性。 */
type ProjectMeetingWorkspaceProps = {
  /** 当前用户可见的项目会议。 */
  meetings: MeetingSummary[];
};

/** 会议状态中文文案。 */
const meetingStatusText: Record<MeetingSummary['status'], string> = {
  SCHEDULED: '待开始',
  LIVE: '进行中',
  ENDED: '已结束',
  CANCELLED: '已取消',
  EXPIRED: '已过期',
};

/** 渲染真实会议列表和无数据空状态。 */
export function ProjectMeetingWorkspace({ meetings }: ProjectMeetingWorkspaceProps) {
  if (meetings.length === 0) {
    return (
      <section className="grid min-h-[30rem] flex-1 place-items-center p-6 text-center" aria-labelledby="project-meetings-title">
        <div className="max-w-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl border border-black/10 bg-white/65">
            <Video className="size-5" aria-hidden />
          </span>
          <h2 id="project-meetings-title" className="mt-4 text-base font-semibold">暂无会议</h2>
          <p className="mt-2 text-xs leading-5 text-black/45">从项目讨论分区发起会议后，会在这里显示日程、参与者和关联决策。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5" aria-labelledby="project-meetings-title">
      <header>
        <h2 id="project-meetings-title" className="text-base font-semibold">项目会议</h2>
        <p className="mt-1 text-xs text-black/45">共 {meetings.length} 场当前可见会议。</p>
      </header>
      <ul className="mt-4 grid gap-3 xl:grid-cols-2">
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <article className="h-full rounded-2xl border border-black/10 bg-white/58 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] text-black/40">{meeting.areaName}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold">{meeting.title}</h3>
                </div>
                <Badge variant={meeting.status === 'LIVE' ? 'default' : 'secondary'}>
                  {meeting.status === 'LIVE' ? <Radio className="mr-1 size-3" aria-hidden /> : null}
                  {meetingStatusText[meeting.status]}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-black/50">
                {meeting.description || '暂无会议说明'}
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-black/45">
                <span className="inline-flex items-center gap-1">
                  <UsersRound className="size-3" aria-hidden />
                  {meeting.participantCount} 位参与者
                </span>
                <span>{meeting.decisions.length} 项关联决策</span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" aria-hidden />
                  {formatMeetingTime(meeting)}
                </span>
              </div>
              <Button asChild variant="ghost" size="sm" className="mt-3 h-8 rounded-full px-3 text-xs">
                <Link href={`/meetings/${meeting.id}`}>进入会议记录</Link>
              </Button>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 根据会议生命周期选择最有意义的时间进行展示。 */
function formatMeetingTime(meeting: MeetingSummary): string {
  const value = meeting.startedAt || meeting.scheduledAt || meeting.createdAt;
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
