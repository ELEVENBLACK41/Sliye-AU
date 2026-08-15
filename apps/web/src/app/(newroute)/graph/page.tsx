/**
 * 本文件提供新版个人关系图谱路由，在服务端完成权限校验并读取真实业务快照。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { RelationshipGraphPage } from '@/features/relationship-graph/components/relationship-graph-page';
import { getRelationshipGraph } from '@/features/relationship-graph/services/relationship-graph-server.service';

/** 校验双重读取权限后渲染当前账号的新版关系图谱。 */
export default async function GraphPage() {
  await Promise.all([
    requireServerPermission(SYSTEM_PERMISSIONS.project.read),
    requireServerPermission(SYSTEM_PERMISSIONS.decision.read),
  ]);
  const graphData = await getRelationshipGraph();

  return <RelationshipGraphPage initialData={graphData} />;
}
