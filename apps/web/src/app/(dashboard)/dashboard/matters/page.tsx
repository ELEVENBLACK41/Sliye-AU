/**
 * 本文件是议事列表路由，在服务端并行获取议事和创建所需部门。
 */
import type { AccessDepartmentTreeNode } from '@workspace/contracts/access';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { getAccessDepartments } from '@/features/access-management/services/access-management-server.service';
import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import { MattersPage } from '@/features/matters/components/matters-page';
import type { MatterDepartmentOption } from '@/features/matters/components/matter-create-form';
import { getMatters } from '@/features/matters/services/matters-server.service';

/** 渲染当前用户可见议事和创建入口。 */
export default async function MattersRoutePage() {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.matter.read);
  const canCreate = hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.matter.create);
  const [matters, departments] = await Promise.all([
    getMatters(),
    canCreate && hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.access.department.read)
      ? getAccessDepartments()
      : Promise.resolve([]),
  ]);

  return <MattersPage matters={matters} canCreate={canCreate} departments={buildDepartmentOptions(departments)} />;
}

/** 将部门树转换为带层级缩进的创建选项。 */
function buildDepartmentOptions(departments: AccessDepartmentTreeNode[], depth = 0): MatterDepartmentOption[] {
  return departments.flatMap((department) => [
    ...(department.status === 'ACTIVE'
      ? [{ id: department.id, label: `${'　'.repeat(depth)}${department.name}` }]
      : []),
    ...buildDepartmentOptions(department.children, depth + 1),
  ]);
}
