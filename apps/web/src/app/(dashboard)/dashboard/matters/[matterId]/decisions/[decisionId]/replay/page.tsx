/**
 * 本文件是议事内决策过程回放入口，按正式事件时间线还原决策形成过程。
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

/** 议事内决策回放动态参数。 */
type MatterDecisionReplayRouteProps = {
  /** Next.js 16 异步路由参数。 */
  params: Promise<{ matterId: string; decisionId: string }>;
};

/** 渲染所属议事一致的决策全过程回放。 */
export default async function MatterDecisionReplayRoutePage({ params }: MatterDecisionReplayRouteProps) {
  await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const routeParams = await params;
  const matterId = Number(routeParams.matterId);
  const decisionId = Number(routeParams.decisionId);

  if (![matterId, decisionId].every((value) => Number.isInteger(value) && value > 0)) {
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

  if (decision.matterId !== matterId) {
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
