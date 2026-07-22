/**
 * 本文件是决策全过程回放页入口，服务端并行读取决策、事件、提案、投票和正式决议。
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

/** 决策回放动态路由参数。 */
type DecisionReplayRouteProps = {
  /** Next.js 16 异步路由参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 渲染授权范围内的决策全过程回放，越权和不存在统一显示 404。 */
export default async function DecisionReplayRoutePage({ params }: DecisionReplayRouteProps) {
  await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const { decisionId: rawDecisionId } = await params;
  const decisionId = Number(rawDecisionId);

  if (!Number.isInteger(decisionId) || decisionId < 1) {
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
