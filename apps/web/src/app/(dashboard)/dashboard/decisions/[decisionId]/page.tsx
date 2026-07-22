/**
 * 本文件是决策详情页面入口，使用“资源 ID + 授权范围”的后端联合查询防止 IDOR。
 */
import { notFound } from 'next/navigation';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@workspace/contracts/access';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import type {
  DecisionDetail,
  DecisionChatMessagePage,
  DecisionEventTimelineItem,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';
import {
  DecisionDetailPage,
  DecisionServerError,
  getDecisionChatMessagePage,
  getDecisionDetail,
  getDecisionEvents,
  getDecisionProposals,
  getDecisionResolutions,
  getDecisionVoteRounds,
} from '@/features/decisions';

/** 动态决策详情路由参数。 */
type DecisionDetailRouteProps = {
  /** Next.js 16 异步路由参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 渲染授权范围内的决策详情，越权和不存在统一显示 404。 */
export default async function DecisionDetailRoutePage({ params }: DecisionDetailRouteProps) {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const { decisionId: rawDecisionId } = await params;
  const decisionId = Number(rawDecisionId);

  if (!Number.isInteger(decisionId) || decisionId < 1) {
    notFound();
  }

  let decision: DecisionDetail;
  let chatMessages: DecisionChatMessagePage;
  let events: DecisionEventTimelineItem[];
  let proposals: DecisionProposal[];
  let voteRounds: DecisionVoteRound[];
  let resolutions: DecisionResolution[];

  try {
    [decision, chatMessages, events, proposals, voteRounds, resolutions] = await Promise.all([
      getDecisionDetail(decisionId),
      getDecisionChatMessagePage(decisionId),
      getDecisionEvents(decisionId),
      getDecisionProposals(decisionId),
      getDecisionVoteRounds(decisionId),
      getDecisionResolutions(decisionId),
    ]);
  } catch (error) {
    if (error instanceof DecisionServerError && error.status === 404) {
      notFound();
    }

    throw error;
  }

  const hasAllScopeSystemRole =
    currentUser.isSuperAdmin || currentUser.roles.some((role) => role.code === SYSTEM_ROLES.admin);
  const canStartDiscussion =
    decision.status === 'DRAFT' &&
    hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.update) &&
    (decision.owner?.id === currentUser.id || hasAllScopeSystemRole);
  const canManageParticipants =
    (decision.status === 'DRAFT' || decision.status === 'DISCUSSING') &&
    hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.update) &&
    (decision.owner?.id === currentUser.id || hasAllScopeSystemRole);
  const currentParticipantRole = decision.participants.find(
    (participant) => participant.user.id === currentUser.id,
  )?.role;
  const canCreateProposal =
    (decision.status === 'DRAFT' || decision.status === 'DISCUSSING') &&
    hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.update) &&
    (hasAllScopeSystemRole || currentParticipantRole === 'OWNER' || currentParticipantRole === 'EDITOR');
  const canManageVoteRounds =
    decision.status === 'DISCUSSING' &&
    hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.update) &&
    (decision.owner?.id === currentUser.id || hasAllScopeSystemRole);
  const canManageConclusion = canManageVoteRounds;
  const canVote =
    decision.status === 'DISCUSSING' && (currentParticipantRole === 'OWNER' || currentParticipantRole === 'APPROVER');
  const isChatLifecycleWritable = decision.status === 'DRAFT' || decision.status === 'DISCUSSING';
  const canSendChat = isChatLifecycleWritable && currentParticipantRole !== undefined;
  const chatReadOnlyReason = !isChatLifecycleWritable
    ? '决策已经结束，群聊历史仅供查看。'
    : currentParticipantRole === undefined
      ? '你不在当前决策的参与者名单中，可以查看历史消息，但不能发送。'
      : undefined;

  return (
    <DecisionDetailPage
      decision={decision}
      initialChatPage={chatMessages}
      currentChatUser={{
        id: currentUser.id,
        name: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
      }}
      events={events}
      proposals={proposals}
      voteRounds={voteRounds}
      resolutions={resolutions}
      canStartDiscussion={canStartDiscussion}
      canManageParticipants={canManageParticipants}
      canCreateProposal={canCreateProposal}
      canManageVoteRounds={canManageVoteRounds}
      canManageConclusion={canManageConclusion}
      canVote={canVote}
      canSendChat={canSendChat}
      chatReadOnlyReason={chatReadOnlyReason}
    />
  );
}
