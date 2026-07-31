/**
 * 本文件是项目内决策过程回放入口，按正式事件时间线还原决策形成过程。
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

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { DecisionReplayPage } from '@/features/decisions/components/decision-replay-page';
import {
  DecisionServerError,
  getDecisionDetail,
  getDecisionEvents,
  getDecisionProposals,
  getDecisionResolutions,
  getDecisionVoteRounds,
} from '@/features/decisions';

/** 项目内决策回放动态参数。 */
type ProjectDecisionReplayRouteProps = {
  /** Next.js 16 异步路由参数。 */
  params: Promise<{ projectId: string; decisionId: string }>;
};

/** 渲染所属项目一致的决策全过程回放。 */
export default async function ProjectDecisionReplayRoutePage({ params }: ProjectDecisionReplayRouteProps) {
  await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
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

  return (
    <DecisionReplayPage
      decision={decision}
      events={events}
      proposals={proposals}
      voteRounds={voteRounds}
      resolutions={resolutions}
    />
  );
}
