/**
 * 本文件是决策列表页面入口，服务端校验功能权限并准备创建决策所需的部门选项。
 */
import { SYSTEM_PERMISSIONS, type AccessDepartmentTreeNode } from '@workspace/contracts/access';

import { getAccessDepartments } from '@/features/access-management/services/access-management-server.service';
import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import type { DecisionDepartmentOption } from '@/features/decisions/components/decision-create-form';
import { DecisionsPage, getDecisionSummaries } from '@/features/decisions';

/** 渲染当前用户数据范围内的决策列表与可选创建入口。 */
export default async function DecisionsRoutePage() {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.decision.read);
  const canCreate = hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.create);
  const [decisions, departments] = await Promise.all([
    getDecisionSummaries(),
    canCreate && hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.access.department.read)
      ? getAccessDepartments()
      : Promise.resolve([]),
  ]);
  const departmentOptions = buildDepartmentOptions(departments, currentUser.department);

  return <DecisionsPage decisions={decisions} canCreate={canCreate} departments={departmentOptions} />;
}

/** 把可见启用部门树转换为创建表单选项，并为异常授权组合保留当前主部门兜底。 */
function buildDepartmentOptions(
  departments: AccessDepartmentTreeNode[],
  currentDepartment: { id: number; name: string; status: 'ACTIVE' | 'DISABLED' } | null,
): DecisionDepartmentOption[] {
  const treeOptions = flattenDepartments(departments)
    .filter(({ department }) => department.status === 'ACTIVE')
    .map(({ department, depth }) => ({
      id: department.id,
      label: `${'　'.repeat(depth)}${department.name}`,
    }));

  if (
    currentDepartment?.status === 'ACTIVE' &&
    !treeOptions.some((department) => department.id === currentDepartment.id)
  ) {
    treeOptions.unshift({ id: currentDepartment.id, label: currentDepartment.name });
  }

  return treeOptions;
}

/** 递归拍平部门树，同时保留深度以展示层级缩进。 */
function flattenDepartments(
  departments: AccessDepartmentTreeNode[],
  depth = 0,
): Array<{ department: AccessDepartmentTreeNode; depth: number }> {
  return departments.flatMap((department) => [
    { department, depth },
    ...flattenDepartments(department.children, depth + 1),
  ]);
}
