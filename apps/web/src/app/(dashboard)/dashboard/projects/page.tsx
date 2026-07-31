/**
 * 本文件是项目列表路由，在服务端并行获取项目和创建所需部门。
 */
import type { AccessDepartmentTreeNode } from '@workspace/contracts/access';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { getAccessDepartments } from '@/features/access-management/services/access-management-server.service';
import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import { ProjectsPage } from '@/features/projects/components/projects-page';
import type { ProjectDepartmentOption } from '@/features/projects/components/project-create-form';
import { getProjects } from '@/features/projects/services/projects-server.service';

/** 渲染当前用户可见项目和创建入口。 */
export default async function ProjectsRoutePage() {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.project.read);
  const canCreate = hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.project.create);
  const [projects, departments] = await Promise.all([
    getProjects(),
    canCreate && hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.access.department.read)
      ? getAccessDepartments()
      : Promise.resolve([]),
  ]);

  return <ProjectsPage projects={projects} canCreate={canCreate} departments={buildDepartmentOptions(departments)} />;
}

/** 将部门树转换为带层级缩进的创建选项。 */
function buildDepartmentOptions(departments: AccessDepartmentTreeNode[], depth = 0): ProjectDepartmentOption[] {
  return departments.flatMap((department) => [
    ...(department.status === 'ACTIVE'
      ? [{ id: department.id, label: `${'　'.repeat(depth)}${department.name}` }]
      : []),
    ...buildDepartmentOptions(department.children, depth + 1),
  ]);
}
