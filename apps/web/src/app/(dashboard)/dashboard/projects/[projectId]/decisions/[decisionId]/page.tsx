/**
 * 本文件是项目内决策详情入口，只读取正式决策产物，不再创建独立决策群聊。
 */
import { notFound } from 'next/navigation';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import {
  DecisionDetailPage,
  DecisionServerError,
  getDecisionDetail,
  getDecisionEvents,
  getDecisionProposals,
  getDecisionResolutions,
  getDecisionVoteRounds,
} from '@/features/decisions';

/** 项目内决策详情动态参数。 */
type ProjectDecisionRouteProps = {
  /** Next.js 16 异步路由参数。 */
  params: Promise<{ projectId: string; decisionId: string }>;
};

/** 渲染所属项目一致且当前成员可见的正式决策资料。 */
export default async function ProjectDecisionRoutePage({ params }: ProjectDecisionRouteProps) {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const routeParams = await params;
  const projectId = Number(routeParams.projectId);
  const decisionId = Number(routeParams.decisionId);

  if (![projectId, decisionId].every((value) => Number.isInteger(value) && value > 0)) {
    notFound();
  }

  let decision: DecisionDetail;
  let events: DecisionEventTimelineItem[];
  let proposals: DecisionProposal[];
  let voteRounds: DecisionVoteRound[];
  let resolutions: DecisionResolution[];

  try {
    [decision, events, proposals, voteRounds, resolutions] = await Promise.all([
      getDecisionDetail(decisionId),
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

  if (decision.projectId !== projectId) {
    notFound();
  }

  const canUpdate = hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.update);
  const currentParticipantRole = decision.participants.find(
    (participant) => participant.user.id === currentUser.id,
  )?.role;
  const isOwner = decision.owner?.id === currentUser.id;

  return (
    <DecisionDetailPage
      decision={decision}
      events={events}
      proposals={proposals}
      voteRounds={voteRounds}
      resolutions={resolutions}
      canStartDiscussion={decision.status === 'DRAFT' && canUpdate && isOwner}
      canManageParticipants={(decision.status === 'DRAFT' || decision.status === 'DISCUSSING') && canUpdate && isOwner}
      canCreateProposal={
        (decision.status === 'DRAFT' || decision.status === 'DISCUSSING') &&
        canUpdate &&
        (currentParticipantRole === 'OWNER' || currentParticipantRole === 'EDITOR')
      }
      canManageVoteRounds={decision.status === 'DISCUSSING' && canUpdate && isOwner}
      canManageConclusion={decision.status === 'DISCUSSING' && canUpdate && isOwner}
      canVote={
        decision.status === 'DISCUSSING' &&
        (currentParticipantRole === 'OWNER' || currentParticipantRole === 'APPROVER')
      }
    />
  );
}
