/**
 * 本文件提供权限管理部门树到带层级列表的纯函数转换能力。
 */
import type { AccessDepartmentTreeNode } from '@workspace/contracts/access';

/** 拍平后的部门节点及其树层级。 */
export type FlattenedDepartment = {
  /** 当前部门节点。 */
  department: AccessDepartmentTreeNode;
  /** 当前节点在部门树中的零基层级。 */
  depth: number;
};

/** 递归拍平部门树，同时保留深度供下拉选项显示层级。 */
export function flattenDepartments(
  departments: AccessDepartmentTreeNode[],
  depth = 0,
): FlattenedDepartment[] {
  return departments.flatMap((department) => [
    { department, depth },
    ...flattenDepartments(department.children, depth + 1),
  ]);
}
