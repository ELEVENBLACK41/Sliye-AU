/**
 * 本文件展示未开始、已结束或已取消会议的精简信息，避免继续呈现实时房间和讨论操作。
 */
import Link from 'next/link';
import { ArrowLeft, CalendarClock, CircleCheckBig, FileClock, UsersRound } from 'lucide-react';
import type { DiscussionAreaSummary, MatterDetail } from '@workspace/contracts/matters';
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { MeetingLifecycleActions } from './meeting-lifecycle-actions';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 非实时会议记录页属性。 */
type MeetingRecordPageProps = {
  /** 当前会议详情。 */
  meeting: MeetingDetail;
  /** 会议所属议事。 */
  matter: MatterDetail;
  /** 会议所属讨论分区。 */
  area: DiscussionAreaSummary;
  /** 当前用户是否可以开始待开始的会议。 */
  canManageMeeting: boolean;
};

/** 渲染会议准备信息或结束后的精简记录，不加载实时聊天和音视频能力。 */
export function MeetingRecordPage({ meeting, matter, area, canManageMeeting }: MeetingRecordPageProps) {
  const isScheduled = meeting.status === 'SCHEDULED';
  const areaHref = `/dashboard/matters/${meeting.matterId}?areaId=${meeting.areaId}`;

  return (
    <main className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={areaHref} aria-label="返回议事分区">
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-semibold">{meeting.title}</h1>
                <Badge variant="secondary">{formatMeetingStatus(meeting.status)}</Badge>
                <Badge variant={area.type === 'PRIVATE' ? 'secondary' : 'outline'}>
                  {area.type === 'PRIVATE' ? '私有会议' : '公共会议'}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {matter.title} · {area.name}
              </p>
            </div>
          </div>
          <MeetingLifecycleActions meetingId={meeting.id} status={meeting.status} canManage={canManageMeeting} />
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-6">
        <section className="min-w-0 space-y-4" aria-label={isScheduled ? '会议准备信息' : '会议记录'}>
          <Alert>
            {isScheduled ? <CalendarClock aria-hidden /> : <CircleCheckBig aria-hidden />}
            <AlertTitle>{getStateTitle(meeting.status)}</AlertTitle>
            <AlertDescription>
              {isScheduled ? (
                '会议开始后才会进入实时音视频和分区讨论空间。'
              ) : (
                <>
                  实时音视频和讨论操作已经关闭。会议期间的文字消息仍保留在
                  <Button asChild variant="link" className="h-auto px-1 py-0">
                    <Link href={areaHref}>{area.name}</Link>
                  </Button>
                  中。
                </>
              )}
            </AlertDescription>
          </Alert>

          <Card className="rounded-md shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileClock className="size-4" aria-hidden />
                {isScheduled ? '会议信息' : '会议记录'}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <RecordItem label="会议说明" value={meeting.description || '暂无会议说明'} />
              <RecordItem label="计划时间" value={formatOptionalDateTime(meeting.scheduledAt)} />
              <RecordItem label="开始时间" value={formatOptionalDateTime(meeting.startedAt)} />
              <RecordItem label="结束时间" value={formatOptionalDateTime(meeting.endedAt)} />
            </CardContent>
          </Card>

          <Card className="rounded-md shadow-none">
            <CardHeader>
              <CardTitle className="text-base">关联决策（{meeting.decisions.length}）</CardTitle>
            </CardHeader>
            <CardContent>
              {meeting.decisions.length ? (
                <ul className="grid gap-2">
                  {meeting.decisions.map((decision) => (
                    <li
                      key={decision.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    >
                      <Link
                        className="text-sm font-medium hover:underline"
                        href={`/dashboard/matters/${matter.id}/decisions/${decision.id}`}
                      >
                        {decision.title}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{formatDecisionStatus(decision.status)}</Badge>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/dashboard/matters/${matter.id}/decisions/${decision.id}/replay`}>过程回放</Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">本次会议未关联具体决策。</p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside aria-label="参会成员">
          <Card className="rounded-md shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="size-4" aria-hidden />
                参会成员（{meeting.participants.length}）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {meeting.participants.map((participant) => (
                  <li key={participant.id} className="rounded-md border p-3">
                    <p className="truncate text-sm font-medium">
                      {participant.user.name || `用户 ${participant.user.id}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatParticipantRole(participant.role)}</p>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

/** 展示会议记录中的一个只读字段。 */
function RecordItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{value}</p>
    </div>
  );
}

/** 返回非实时会议状态标题。 */
function getStateTitle(status: MeetingDetail['status']): string {
  return {
    SCHEDULED: '会议尚未开始',
    LIVE: '会议进行中',
    ENDED: '会议已结束',
    CANCELLED: '会议已取消',
  }[status];
}

/** 格式化会议状态。 */
function formatMeetingStatus(status: MeetingDetail['status']): string {
  return { SCHEDULED: '待开始', LIVE: '进行中', ENDED: '已结束', CANCELLED: '已取消' }[status];
}

/** 格式化决策状态。 */
function formatDecisionStatus(status: MeetingDetail['decisions'][number]['status']): string {
  return { DRAFT: '草稿', DISCUSSING: '讨论中', RESOLVED: '已解决', CANCELLED: '已取消', ARCHIVED: '已归档' }[status];
}

/** 格式化参会角色。 */
function formatParticipantRole(role: MeetingDetail['participants'][number]['role']): string {
  return { HOST: '主持人', CO_HOST: '联席主持', ATTENDEE: '参会成员' }[role];
}

/** 格式化可空会议时间。 */
function formatOptionalDateTime(value: string | null): string {
  if (!value) return '未记录';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
