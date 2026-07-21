/**
 * 本文件是决策详情页面入口，使用“资源 ID + 授权范围”的后端联合查询防止 IDOR。
 */
import { notFound } from 'next/navigation';
import { SYSTEM_PERMISSIONS, SYSTEM_ROLES } from '@workspace/contracts/access';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import type { DecisionDetail, DecisionEventTimelineItem } from '@workspace/contracts/decisions';
import { DecisionDetailPage, DecisionServerError, getDecisionDetail, getDecisionEvents } from '@/features/decisions';

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
  let events: DecisionEventTimelineItem[];

  try {
    [decision, events] = await Promise.all([getDecisionDetail(decisionId), getDecisionEvents(decisionId)]);
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

  return (
    <DecisionDetailPage
      decision={decision}
      events={events}
      canStartDiscussion={canStartDiscussion}
      canManageParticipants={canManageParticipants}
    />
  );
}
