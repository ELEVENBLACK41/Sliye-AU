/**
 * 本文件提供新版组织与权限模块使用的部门树纯函数。
 */
import type { AccessDepartmentTreeNode } from '@workspace/contracts/access';

/** 展平后的部门节点及其层级。 */
export type FlattenedOrganizationDepartment = {
  /** 部门节点。 */
  department: AccessDepartmentTreeNode;
  /** 从零开始的树深度。 */
  depth: number;
};

/** 按现有树顺序递归展平部门，供筛选器和树形列表复用。 */
export function flattenOrganizationDepartments(
  departments: AccessDepartmentTreeNode[],
  depth = 0,
): FlattenedOrganizationDepartment[] {
  return departments.flatMap((department) => [
    { department, depth },
    ...flattenOrganizationDepartments(department.children, depth + 1),
  ]);
}
