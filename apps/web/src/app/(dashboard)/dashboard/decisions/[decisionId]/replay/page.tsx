/**
 * 本文件保留旧决策回放地址，并重定向到所属议事下的新回放地址。
 */
import { notFound, redirect } from 'next/navigation';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { DecisionServerError, getDecisionDetail } from '@/features/decisions';

/** 决策回放动态路由参数。 */
type DecisionReplayRouteProps = {
  /** Next.js 16 异步路由参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 读取所属议事后跳转到新的嵌套回放地址。 */
export default async function DecisionReplayRoutePage({ params }: DecisionReplayRouteProps) {
  await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const { decisionId: rawDecisionId } = await params;
  const decisionId = Number(rawDecisionId);

  if (!Number.isInteger(decisionId) || decisionId < 1) {
    notFound();
  }

  try {
    const decision = await getDecisionDetail(decisionId);
    redirect(`/dashboard/matters/${decision.matterId}/decisions/${decision.id}/replay`);
  } catch (error) {
    if (error instanceof DecisionServerError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
