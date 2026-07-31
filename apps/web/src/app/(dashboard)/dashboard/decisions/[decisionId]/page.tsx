/**
 * 本文件保留旧决策详情地址，并把合法资源重定向到所属项目的嵌套路由。
 */
import { notFound, redirect } from 'next/navigation';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { DecisionServerError, getDecisionDetail } from '@/features/decisions';

/** 动态决策详情路由参数。 */
type DecisionDetailRouteProps = {
  /** Next.js 16 异步路由参数。 */
  params: Promise<{ decisionId: string }>;
};

/** 读取决策所属项目后跳转到新的嵌套详情地址。 */
export default async function DecisionDetailRoutePage({ params }: DecisionDetailRouteProps) {
  await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const { decisionId: rawDecisionId } = await params;
  const decisionId = Number(rawDecisionId);

  if (!Number.isInteger(decisionId) || decisionId < 1) {
    notFound();
  }

  try {
    const decision = await getDecisionDetail(decisionId);
    redirect(`/dashboard/projects/${decision.projectId}/decisions/${decision.id}`);
  } catch (error) {
    if (error instanceof DecisionServerError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
