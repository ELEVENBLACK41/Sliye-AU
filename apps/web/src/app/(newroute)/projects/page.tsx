/**
 * 本文件为新版项目空间路由，在服务端完成权限校验并准备当前项目首屏数据。
 */
import { redirect, unstable_rethrow } from 'next/navigation';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';
import type { DecisionSummary } from '@workspace/contracts/decisions';
import type { MeetingSummary } from '@workspace/contracts/meetings';
import type {
  DiscussionAreaSummary,
  ProjectChatMessagePage,
  ProjectDetail,
  ProjectMember,
  ProjectMemberCandidate,
  ProjectSummary,
  ProjectUserSummary,
} from '@workspace/contracts/projects';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import { getAccessDepartments } from '@/features/access-management/services/access-management-server.service';
import { flattenDepartments } from '@/features/access-management/utils/flatten-departments';
import { ProjectSpaceEmptyState } from '@/features/project-space/components/project-space-empty-state';
import { ProjectSpacePage } from '@/features/project-space/components/project-space-page';
import {
  getProjectSpaceAreas,
  getProjectSpaceDecisions,
  getProjectSpaceMeetings,
  getProjectSpaceMembers,
  getProjectSpaceMemberCandidates,
  getProjectSpaceMessages,
  getProjectSpaceProject,
  getProjectSpaceProjects,
  ProjectSpaceServerError,
} from '@/features/project-space/services/project-space-server.service';

/** 项目空间路由支持的稳定查询参数。 */
type ProjectsPageProps = {
  /** 项目和讨论分区选择通过查询参数持久化。 */
  searchParams: Promise<{ projectId?: string; areaId?: string }>;
};

/** 当前项目首屏需要一次性交给展示层的数据。 */
type ProjectSpaceRouteData = {
  /** 当前用户可见的项目列表。 */
  projects: ProjectSummary[];
  /** 当前选中项目详情。 */
  project: ProjectDetail;
  /** 当前项目下用户可见的讨论分区。 */
  areas: DiscussionAreaSummary[];
  /** 当前选中的讨论分区。 */
  currentArea: DiscussionAreaSummary;
  /** 当前分区首屏消息。 */
  initialMessages: ProjectChatMessagePage;
  /** 当前项目成员。 */
  members: ProjectMember[];
  /** 当前项目尚可添加的组织用户。 */
  memberCandidates: ProjectMemberCandidate[];
  /** 当前项目决策摘要。 */
  decisions: DecisionSummary[];
  /** 当前项目会议摘要。 */
  meetings: MeetingSummary[];
};

/** 渲染当前用户的新版项目协作空间。 */
export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.project.read);
  const canCreateProject = hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.project.create);
  const [query, projects, departmentTree] = await Promise.all([
    searchParams,
    getProjectSpaceProjects(),
    canCreateProject && hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.access.department.read)
      ? getAccessDepartments()
      : Promise.resolve([]),
  ]);
  const createDepartmentOptions = flattenDepartments(departmentTree)
    .filter(({ department }) => department.status === 'ACTIVE')
    .map(({ department, depth }) => ({ id: department.id, label: `${'　'.repeat(depth)}${department.name}` }));

  if (projects.length === 0) {
    return (
      <ProjectSpaceEmptyState
        canCreate={canCreateProject}
        createDepartmentOptions={createDepartmentOptions}
      />
    );
  }

  const selectedProjectId = parsePositiveInteger(query.projectId) ?? projects[0]?.id;
  if (!selectedProjectId || !projects.some((project) => project.id === selectedProjectId)) {
    redirect('/projects');
  }

  let pageData: ProjectSpaceRouteData;
  try {
    const [project, areas, members, decisions, meetings] = await Promise.all([
      getProjectSpaceProject(selectedProjectId),
      getProjectSpaceAreas(selectedProjectId),
      getProjectSpaceMembers(selectedProjectId),
      getProjectSpaceDecisions(selectedProjectId),
      getProjectSpaceMeetings(selectedProjectId),
    ]);
    const requestedAreaId = parsePositiveInteger(query.areaId) ?? project.publicAreaId;
    const currentArea = areas.find((area) => area.id === requestedAreaId);

    if (!currentArea) {
      redirect(`/projects?projectId=${project.id}&areaId=${project.publicAreaId}`);
    }

    const canManageProject =
      hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.project.update) &&
      (project.currentUserRole === 'OWNER' || project.currentUserRole === 'MANAGER');
    const [initialMessages, memberCandidates] = await Promise.all([
      getProjectSpaceMessages(project.id, currentArea.id),
      canManageProject && project.status === 'ACTIVE'
        ? getProjectSpaceMemberCandidates(project.id)
        : Promise.resolve([]),
    ]);
    pageData = {
      projects,
      project,
      areas,
      currentArea,
      initialMessages,
      members,
      memberCandidates,
      decisions,
      meetings,
    };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ProjectSpaceServerError && error.status === 404) {
      redirect('/projects');
    }
    throw error;
  }

  const currentUserSummary: ProjectUserSummary = {
    id: currentUser.id,
    name: currentUser.name,
    avatarUrl: currentUser.avatarUrl,
  };

  return (
    <ProjectSpacePage
      {...pageData}
      currentUser={currentUserSummary}
      canCreateProject={canCreateProject}
      canManageProject={
        hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.project.update) &&
        (pageData.project.currentUserRole === 'OWNER' || pageData.project.currentUserRole === 'MANAGER')
      }
      createDepartmentOptions={createDepartmentOptions}
    />
  );
}

/** 将可选查询参数解析为安全的正整数主键。 */
function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : undefined;
}
