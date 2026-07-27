/**
 * 本文件组合议事分区会议房间、会议聊天、多决策目标选择和正式决策操作。
 */
import Link from 'next/link';
import { ArrowLeft, CircleDot, UsersRound } from 'lucide-react';
import type {
  DecisionDetail,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';
import type {
  DiscussionAreaSummary,
  MatterChatMessagePage,
  MatterDetail,
  MatterUserSummary,
} from '@workspace/contracts/matters';
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { MeetingLifecycleActions } from './meeting-lifecycle-actions';
import { MeetingLiveKitRoom } from './meeting-livekit-room';
import { MeetingRecordPage } from './meeting-record-page';
import { DecisionProposalSection } from '@/features/decisions/components/decision-proposal-section';
import { DecisionResolutionSection } from '@/features/decisions/components/decision-resolution-section';
import { DecisionStatusActions } from '@/features/decisions/components/decision-status-actions';
import { DecisionVoteSection } from '@/features/decisions/components/decision-vote-section';
import { MatterChatPanel } from '@/features/matters/chat/components/matter-chat-panel';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

/** 全屏议事会议房间属性。 */
type MeetingRoomPageProps = {
  meeting: MeetingDetail;
  matter: MatterDetail;
  area: DiscussionAreaSummary;
  selectedDecision: DecisionDetail | null;
  initialChatPage: MatterChatMessagePage;
  currentChatUser: MatterUserSummary;
  proposals: DecisionProposal[];
  voteRounds: DecisionVoteRound[];
  resolutions: DecisionResolution[];
  canManageMeeting: boolean;
  canStartDiscussion: boolean;
  canCreateProposal: boolean;
  canManageVoteRounds: boolean;
  canManageConclusion: boolean;
  canVote: boolean;
  canSendChat: boolean;
  canJoinMeeting: boolean;
};

/** 渲染不依赖 dashboard 外壳的公共或私有会议协作空间。 */
export function MeetingRoomPage({
  meeting,
  matter,
  area,
  selectedDecision,
  initialChatPage,
  currentChatUser,
  proposals,
  voteRounds,
  resolutions,
  canManageMeeting,
  canStartDiscussion,
  canCreateProposal,
  canManageVoteRounds,
  canManageConclusion,
  canVote,
  canSendChat,
  canJoinMeeting,
}: MeetingRoomPageProps) {
  const isLive = meeting.status === 'LIVE';

  if (!isLive) {
    return <MeetingRecordPage meeting={meeting} matter={matter} area={area} canManageMeeting={canManageMeeting} />;
  }

  return (
    <main className="min-h-dvh bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={`/dashboard/matters/${meeting.matterId}?areaId=${meeting.areaId}`} aria-label="返回议事分区">
                <ArrowLeft aria-hidden />
              </Link>
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-semibold">{meeting.title}</h1>
                <Badge variant={isLive ? 'default' : 'secondary'}>{formatMeetingStatus(meeting.status)}</Badge>
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

      <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:p-6">
        <section className="min-w-0 space-y-4" aria-label="会议协作区">
          <MeetingLiveKitRoom meetingId={meeting.id} canJoin={canJoinMeeting} />

          <Card className="rounded-md shadow-none">
            <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
              <RoomSummary label="会议说明" value={meeting.description || '暂无会议说明'} />
              <RoomSummary label="计划时间" value={formatDateTime(meeting.scheduledAt ?? meeting.createdAt)} />
              <RoomSummary label="当前阶段" value={isLive ? '可记录会议内容' : '房间内容只读'} />
            </CardContent>
          </Card>

          <Card className="rounded-md shadow-none">
            <CardHeader>
              <CardTitle className="text-base">正式操作目标</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {meeting.decisions.length ? (
                meeting.decisions.map((decision) => (
                  <Button
                    key={decision.id}
                    asChild
                    size="sm"
                    variant={selectedDecision?.id === decision.id ? 'default' : 'outline'}
                  >
                    <Link href={`/meetings/${meeting.id}?decisionId=${decision.id}`}>{decision.title}</Link>
                  </Button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  这是普通议事会议，未关联决策，因此不能在会议上下文中形成提案、投票或决议。
                </p>
              )}
            </CardContent>
          </Card>

          {selectedDecision?.status === 'DRAFT' ? (
            <>
              <Alert>
                <AlertTitle>当前决策仍处于草稿阶段</AlertTitle>
                <AlertDescription>
                  草稿阶段可以继续整理提案，但必须由决策负责人先开始讨论，才能发起投票或形成正式决议。
                </AlertDescription>
              </Alert>
              {canStartDiscussion ? <DecisionStatusActions decisionId={selectedDecision.id} /> : null}
            </>
          ) : null}

          <Tabs defaultValue="discussion" className="gap-4">
            <TabsList className="h-auto w-full justify-start overflow-x-auto bg-background p-1">
              <TabsTrigger value="discussion">讨论</TabsTrigger>
              {selectedDecision ? <TabsTrigger value="proposals">提案 {proposals.length}</TabsTrigger> : null}
              {selectedDecision ? <TabsTrigger value="votes">投票 {voteRounds.length}</TabsTrigger> : null}
              {selectedDecision ? <TabsTrigger value="resolutions">决议 {resolutions.length}</TabsTrigger> : null}
            </TabsList>
            <TabsContent value="discussion">
              <MatterChatPanel
                matterId={matter.id}
                area={area}
                sourceMeetingId={meeting.id}
                initialPage={initialChatPage}
                currentUser={currentChatUser}
                canSend={canSendChat}
                readOnlyReason="你不在当前会议受邀成员中，不能发送消息。"
              />
            </TabsContent>
            {selectedDecision ? (
              <>
                <TabsContent value="proposals">
                  <DecisionProposalSection
                    decisionId={selectedDecision.id}
                    meetingId={meeting.id}
                    proposals={proposals}
                    canCreateProposal={canCreateProposal}
                    canManageConclusion={canManageConclusion}
                  />
                </TabsContent>
                <TabsContent value="votes">
                  <DecisionVoteSection
                    decisionId={selectedDecision.id}
                    meetingId={meeting.id}
                    proposals={proposals}
                    voteRounds={voteRounds}
                    canManageVoteRounds={canManageVoteRounds}
                    canVote={canVote}
                  />
                </TabsContent>
                <TabsContent value="resolutions">
                  <DecisionResolutionSection
                    matterId={matter.id}
                    decisionId={selectedDecision.id}
                    meetingId={meeting.id}
                    proposals={proposals}
                    voteRounds={voteRounds}
                    resolutions={resolutions}
                    canManageConclusion={canManageConclusion}
                  />
                </TabsContent>
              </>
            ) : null}
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
