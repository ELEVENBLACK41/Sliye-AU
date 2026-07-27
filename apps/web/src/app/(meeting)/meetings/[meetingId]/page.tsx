/**
 * 本文件是议事分区会议房间入口，支持普通会议与多决策会议目标切换。
 */
import { notFound } from 'next/navigation';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';
import type {
  DecisionDetail,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';
import type { DiscussionAreaSummary, MatterChatMessagePage, MatterDetail } from '@workspace/contracts/matters';
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import {
  DecisionServerError,
  getDecisionDetail,
  getDecisionProposals,
  getDecisionResolutions,
  getDecisionVoteRounds,
} from '@/features/decisions';
import {
  getMatter,
  getMatterAreas,
  getMatterMessages,
  MatterServerError,
} from '@/features/matters/services/matters-server.service';
import { MeetingRoomPage } from '@/features/meetings/components/meeting-room-page';
import { getMeetingDetail, MeetingServerError } from '@/features/meetings/services/meetings-server.service';

/** 会议房间动态路由与目标决策查询参数。 */
type MeetingRoomRouteProps = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
  /** 多决策会议当前选择的正式操作目标。 */
  searchParams: Promise<{ decisionId?: string }>;
};

/** 渲染当前用户可见的分区会议，并为正式操作准备单项决策上下文。 */
export default async function MeetingRoomRoutePage({ params, searchParams }: MeetingRoomRouteProps) {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.matter.read);
  const meetingId = Number((await params).meetingId);
  const requestedDecisionId = Number((await searchParams).decisionId);

  if (!Number.isInteger(meetingId) || meetingId < 1) {
    notFound();
  }

  let meeting: MeetingDetail;
  let matter: MatterDetail;
  let area: DiscussionAreaSummary;
  let initialChatPage: MatterChatMessagePage;

  try {
    meeting = await getMeetingDetail(meetingId);
    const [matterResult, areas, chatPage] = await Promise.all([
      getMatter(meeting.matterId),
      getMatterAreas(meeting.matterId),
      meeting.status === 'LIVE'
        ? getMatterMessages(meeting.matterId, meeting.areaId)
        : Promise.resolve({ items: [], nextCursor: null, hasMore: false }),
    ]);
    matter = matterResult;
    initialChatPage = chatPage;
    const visibleArea = areas.find((item) => item.id === meeting.areaId);
    if (!visibleArea) notFound();
    area = visibleArea;
  } catch (error) {
    if ((error instanceof MeetingServerError || error instanceof MatterServerError) && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const selectedSummary =
    meeting.decisions.find((item) => item.id === requestedDecisionId) ?? meeting.decisions.at(0) ?? null;
  let selectedDecision: DecisionDetail | null = null;
  let proposals: DecisionProposal[] = [];
  let voteRounds: DecisionVoteRound[] = [];
  let resolutions: DecisionResolution[] = [];

  if (meeting.status === 'LIVE' && selectedSummary) {
    try {
      [selectedDecision, proposals, voteRounds, resolutions] = await Promise.all([
        getDecisionDetail(selectedSummary.id),
        getDecisionProposals(selectedSummary.id),
        getDecisionVoteRounds(selectedSummary.id),
        getDecisionResolutions(selectedSummary.id),
      ]);
    } catch (error) {
      if (error instanceof DecisionServerError && error.status === 404) notFound();
      throw error;
    }
  }

  const meetingRole = meeting.participants.find((item) => item.user.id === currentUser.id)?.role;
  const participantRole = selectedDecision?.participants.find((item) => item.user.id === currentUser.id)?.role;
  const canUpdateDecision = hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.update);
  const isLive = meeting.status === 'LIVE';
  const isDraft = selectedDecision?.status === 'DRAFT';
  const isDiscussing = selectedDecision?.status === 'DISCUSSING';
  const canManageMeeting =
    hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.matter.update) &&
    (meetingRole === 'HOST' || meetingRole === 'CO_HOST');
  const canCreateProposal =
    isLive &&
    (isDraft || isDiscussing) &&
    canUpdateDecision &&
    (participantRole === 'OWNER' || participantRole === 'EDITOR');
  const canStartDiscussion = isLive && isDraft && canUpdateDecision && selectedDecision?.owner?.id === currentUser.id;
  const canManageConclusion =
    isLive && isDiscussing && canUpdateDecision && selectedDecision?.owner?.id === currentUser.id;
  const canVote = isLive && isDiscussing && (participantRole === 'OWNER' || participantRole === 'APPROVER');
  const canSendChat = matter.status === 'ACTIVE' && area.status === 'ACTIVE' && isLive && meetingRole !== undefined;

  return (
    <MeetingRoomPage
      meeting={meeting}
      matter={matter}
      area={area}
      selectedDecision={selectedDecision}
      initialChatPage={initialChatPage}
      currentChatUser={{ id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl }}
      proposals={proposals}
      voteRounds={voteRounds}
      resolutions={resolutions}
      canManageMeeting={canManageMeeting}
      canStartDiscussion={canStartDiscussion}
      canCreateProposal={canCreateProposal}
      canManageVoteRounds={canManageConclusion}
      canManageConclusion={canManageConclusion}
      canVote={canVote}
      canSendChat={canSendChat}
      canJoinMeeting={isLive && meetingRole !== undefined}
    />
  );
}
