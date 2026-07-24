/**
 * 本文件是独立会议房间入口，服务端并行读取决策协作数据并计算展示权限。
 */
import { notFound } from 'next/navigation';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@workspace/contracts/access';
import type {
  DecisionChatMessagePage,
  DecisionDetail,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import {
  DecisionServerError,
  getDecisionChatMessagePage,
  getDecisionDetail,
  getDecisionProposals,
  getDecisionResolutions,
  getDecisionVoteRounds,
} from '@/features/decisions';
import { MeetingRoomPage } from '@/features/meetings/components/meeting-room-page';
import { getMeetingDetail, MeetingServerError } from '@/features/meetings/services/meetings-server.service';

/** 会议房间动态路由参数。 */
type MeetingRoomRouteProps = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 渲染授权范围内的独立会议房间。 */
export default async function MeetingRoomRoutePage({ params }: MeetingRoomRouteProps) {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const { meetingId: rawMeetingId } = await params;
  const meetingId = Number(rawMeetingId);

  if (!Number.isInteger(meetingId) || meetingId < 1) {
    notFound();
  }

  let meeting: MeetingDetail;
  let decision: DecisionDetail;
  let initialChatPage: DecisionChatMessagePage;
  let proposals: DecisionProposal[];
  let voteRounds: DecisionVoteRound[];
  let resolutions: DecisionResolution[];

  try {
    meeting = await getMeetingDetail(meetingId);
    [decision, initialChatPage, proposals, voteRounds, resolutions] = await Promise.all([
      getDecisionDetail(meeting.decisionId),
      getDecisionChatMessagePage(meeting.decisionId),
      getDecisionProposals(meeting.decisionId),
      getDecisionVoteRounds(meeting.decisionId),
      getDecisionResolutions(meeting.decisionId),
    ]);
  } catch (error) {
    if ((error instanceof MeetingServerError || error instanceof DecisionServerError) && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const hasAllScopeSystemRole =
    currentUser.isSuperAdmin || currentUser.roles.some((role) => role.code === SYSTEM_ROLES.admin);
  const participantRole = decision.participants.find((item) => item.user.id === currentUser.id)?.role;
  const meetingRole = meeting.participants.find((item) => item.user.id === currentUser.id)?.role;
  const canUpdateDecision = hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.update);
  const canManageMeeting =
    canUpdateDecision && (hasAllScopeSystemRole || meetingRole === 'HOST' || meetingRole === 'CO_HOST');
  const canCreateProposal =
    canUpdateDecision && (hasAllScopeSystemRole || participantRole === 'OWNER' || participantRole === 'EDITOR');
  const canManageVoteRounds = canUpdateDecision && (hasAllScopeSystemRole || decision.owner?.id === currentUser.id);
  const canVote = participantRole === 'OWNER' || participantRole === 'APPROVER';
  const canSendChat = meeting.status === 'LIVE' && participantRole !== undefined;

  return (
    <MeetingRoomPage
      meeting={meeting}
      decision={decision}
      initialChatPage={initialChatPage}
      currentChatUser={{ id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl }}
      proposals={proposals}
      voteRounds={voteRounds}
      resolutions={resolutions}
      canManageMeeting={canManageMeeting}
      canCreateProposal={canCreateProposal}
      canManageVoteRounds={canManageVoteRounds}
      canManageConclusion={canManageVoteRounds}
      canVote={canVote}
      canSendChat={canSendChat}
    />
  );
}
