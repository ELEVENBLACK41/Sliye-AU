/**
 * 本文件组合独立的全屏无音视频会议房间、业务分区和成员列表。
 */
import Link from 'next/link';
import { ArrowLeft, CalendarClock, CircleDot, MessageSquareText, UsersRound } from 'lucide-react';
import type {
  DecisionDetail,
  DecisionChatMessagePage,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
  DecisionUserSummary,
} from '@workspace/contracts/decisions';
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { MeetingLifecycleActions } from './meeting-lifecycle-actions';
import { DecisionChatSection } from '@/features/decisions/chat/components/decision-chat-section';
import { DecisionProposalSection } from '@/features/decisions/components/decision-proposal-section';
import { DecisionResolutionSection } from '@/features/decisions/components/decision-resolution-section';
import { DecisionVoteSection } from '@/features/decisions/components/decision-vote-section';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

/** 全屏会议房间属性。 */
type MeetingRoomPageProps = {
  /** 当前会议详情。 */
  meeting: MeetingDetail;
  /** 当前会议所属决策。 */
  decision: DecisionDetail;
  /** 当前会议的首屏消息。 */
  initialChatPage: DecisionChatMessagePage;
  /** 当前登录用户的聊天摘要。 */
  currentChatUser: DecisionUserSummary;
  /** 当前决策的全部提案，允许会议讨论既有提案。 */
  proposals: DecisionProposal[];
  /** 当前决策的全部投票轮次。 */
  voteRounds: DecisionVoteRound[];
  /** 当前决策的正式决议。 */
  resolutions: DecisionResolution[];
  /** 是否可以管理会议生命周期。 */
  canManageMeeting: boolean;
  /** 是否可以创建提案。 */
  canCreateProposal: boolean;
  /** 是否可以管理投票轮次。 */
  canManageVoteRounds: boolean;
  /** 是否可以形成正式决议。 */
  canManageConclusion: boolean;
  /** 是否可以提交选票。 */
  canVote: boolean;
  /** 是否可以在会议内发送消息。 */
  canSendChat: boolean;
};

/** 渲染不依赖 dashboard 外壳的会议协作空间。 */
export function MeetingRoomPage({
  meeting,
  decision,
  initialChatPage,
  currentChatUser,
  proposals,
  voteRounds,
  resolutions,
  canManageMeeting,
  canCreateProposal,
  canManageVoteRounds,
  canManageConclusion,
  canVote,
  canSendChat,
}: MeetingRoomPageProps) {
  const isLive = meeting.status === 'LIVE';

  return (
    <main className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={`/dashboard/decisions/${decision.id}`} aria-label="返回决策详情">
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-semibold">{meeting.title}</h1>
                <Badge variant={isLive ? 'default' : 'secondary'}>{formatMeetingStatus(meeting.status)}</Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                决策 #{decision.id} · {decision.title}
              </p>
            </div>
          </div>
          <MeetingLifecycleActions meetingId={meeting.id} status={meeting.status} canManage={canManageMeeting} />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:p-6">
        <section className="min-w-0 space-y-4" aria-label="会议协作区">
          <Card className="rounded-md shadow-none">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
              <RoomSummary label="会议说明" value={meeting.description || '暂无会议说明'} />
              <RoomSummary label="计划时间" value={formatDateTime(meeting.scheduledAt ?? meeting.createdAt)} />
              <RoomSummary label="当前阶段" value={isLive ? '可记录会议内容' : '房间内容只读'} />
            </CardContent>
          </Card>

          <Tabs defaultValue="discussion" className="gap-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto bg-background p-1">
              <TabsTrigger value="discussion">讨论</TabsTrigger>
              <TabsTrigger value="proposals">提案 {proposals.length}</TabsTrigger>
              <TabsTrigger value="votes">投票 {voteRounds.length}</TabsTrigger>
              <TabsTrigger value="resolutions">决议 {resolutions.length}</TabsTrigger>
            </TabsList>
            <TabsContent value="discussion">
              <DecisionChatSection
                decisionId={decision.id}
                meetingId={meeting.id}
                initialPage={initialChatPage}
                currentUser={currentChatUser}
                canSend={canSendChat}
                readOnlyReason={isLive ? '你不是当前决策参与者，不能发送消息。' : '会议未进行或已经结束，内容只读。'}
              />
            </TabsContent>
            <TabsContent value="proposals">
              <DecisionProposalSection
                decisionId={decision.id}
                meetingId={meeting.id}
                proposals={proposals}
                canCreateProposal={isLive && canCreateProposal}
                canManageConclusion={isLive && canManageConclusion}
              />
            </TabsContent>
            <TabsContent value="votes">
              <DecisionVoteSection
                decisionId={decision.id}
                meetingId={meeting.id}
                proposals={proposals}
                voteRounds={voteRounds}
                canManageVoteRounds={isLive && canManageVoteRounds}
                canVote={isLive && canVote}
              />
            </TabsContent>
            <TabsContent value="resolutions">
              <DecisionResolutionSection
                decisionId={decision.id}
                meetingId={meeting.id}
                proposals={proposals}
                voteRounds={voteRounds}
                resolutions={resolutions}
                canManageConclusion={isLive && canManageConclusion}
              />
            </TabsContent>
          </Tabs>
        </section>

        <aside className="space-y-4" aria-label="会议成员与实时能力">
          <Card className="rounded-md shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <UsersRound className="size-4" aria-hidden />
                受邀成员（{meeting.participants.length}）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2">
                {meeting.participants.map((participant) => (
                  <li key={participant.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {participant.user.name || `用户 ${participant.user.id}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatParticipantRole(participant.role)}</p>
                    </div>
                    <CircleDot className="size-3 text-muted-foreground" aria-label="实时在线状态尚未接入" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-md border-dashed shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareText className="size-4" aria-hidden />
                音视频接入位
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>当前阶段只完成会议业务闭环，不会申请麦克风、摄像头或 LiveKit Token。</p>
              <p className="flex items-center gap-2">
                <CalendarClock className="size-4" aria-hidden />
                实时进退会状态将在 LiveKit 阶段接入。
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

/** 渲染会议摘要字段。 */
function RoomSummary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm font-medium">{value}</p>
    </div>
  );
}

/** 格式化会议状态。 */
function formatMeetingStatus(status: MeetingDetail['status']): string {
  return { SCHEDULED: '待开始', LIVE: '进行中', ENDED: '已结束', CANCELLED: '已取消' }[status];
}

/** 格式化会议成员角色。 */
function formatParticipantRole(role: MeetingDetail['participants'][number]['role']): string {
  return { HOST: '主持人', CO_HOST: '联席主持', ATTENDEE: '参会成员' }[role];
}

/** 格式化时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
