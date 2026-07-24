/**
 * 本文件在决策详情展示轻量会议入口，避免把完整会议业务继续堆入 dashboard。
 */
import Link from 'next/link';
import { CalendarDays, ExternalLink } from 'lucide-react';
import type { MeetingSummary } from '@workspace/contracts/meetings';

import { MeetingCreateAction } from './meeting-create-action';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 决策会议入口属性。 */
type DecisionMeetingSectionProps = {
  /** 当前决策主键。 */
  decisionId: number;
  /** 当前决策的会议列表。 */
  meetings: MeetingSummary[];
  /** 当前用户是否展示创建会议入口。 */
  canCreateMeeting: boolean;
};

/** 展示会议摘要和独立房间跳转入口。 */
export function DecisionMeetingSection({ decisionId, meetings, canCreateMeeting }: DecisionMeetingSectionProps) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4" aria-hidden />
          会议（{meetings.length}）
        </CardTitle>
        {canCreateMeeting ? <MeetingCreateAction decisionId={decisionId} /> : null}
      </CardHeader>
      <CardContent>
        {meetings.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {meetings.map((meeting) => (
              <li key={meeting.id} className="flex items-center justify-between gap-4 rounded-md border p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{meeting.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {meeting.participantCount} 位成员 · {formatDateTime(meeting.scheduledAt ?? meeting.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={meeting.status === 'LIVE' ? 'default' : 'secondary'}>
                    {formatMeetingStatus(meeting.status)}
                  </Badge>
                  <Button asChild size="icon-sm" variant="ghost">
                    <Link href={`/meetings/${meeting.id}`} aria-label={`进入会议：${meeting.title}`}>
                      <ExternalLink aria-hidden />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-md border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">还没有会议</p>
            <p className="mt-1 text-sm text-muted-foreground">提案可以先独立产生，需要同步沟通时再创建会议。</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** 格式化会议状态。 */
function formatMeetingStatus(status: MeetingSummary['status']): string {
  return { SCHEDULED: '待开始', LIVE: '进行中', ENDED: '已结束', CANCELLED: '已取消' }[status];
}

/** 格式化会议时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
