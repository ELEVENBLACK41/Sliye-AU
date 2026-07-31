/**
 * 本文件是项目详情路由，在服务端校验可见分区并并行准备首屏数据。
 */
import { notFound, redirect } from 'next/navigation';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';
import type { DecisionSummary } from '@workspace/contracts/decisions';
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  ProjectChatMessagePage,
  ProjectDetail,
  ProjectMember,
  ProjectMemberCandidate,
  ProjectUserSummary,
} from '@workspace/contracts/projects';
import type { MeetingSummary } from '@workspace/contracts/meetings';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import { ProjectDetailPage } from '@/features/projects/components/project-detail-page';
import {
  getAreaMembers,
  getProject,
  getProjectAreas,
  getProjectDecisions,
  getProjectMeetings,
  getProjectMemberCandidates,
  getProjectMembers,
  getProjectMessages,
  ProjectServerError,
} from '@/features/projects/services/projects-server.service';

/** 项目详情异步路由与查询参数。 */
type ProjectRouteProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ areaId?: string; decisionId?: string }>;
};

/** 页面完成授权和查询后使用的稳定渲染数据。 */
type ProjectPageData = {
  project: ProjectDetail;
  areas: DiscussionAreaSummary[];
  currentArea: DiscussionAreaSummary;
  initialMessages: ProjectChatMessagePage;
  members: ProjectMember[];
  memberCandidates: ProjectMemberCandidate[];
  areaMembers: DiscussionAreaMember[];
  relatedDecisions: DecisionSummary[];
  contextDecisions: DecisionSummary[];
  contextMeetings: MeetingSummary[];
  meetingCandidates: ProjectUserSummary[];
  decisionFilterId?: number;
};

/** 渲染项目三栏协作空间。 */
export default async function ProjectRoutePage({ params, searchParams }: ProjectRouteProps) {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.project.read);
  const [{ projectId: rawProjectId }, query] = await Promise.all([params, searchParams]);
  const projectId = Number(rawProjectId);
  if (!Number.isInteger(projectId) || projectId < 1) notFound();

  let pageData: ProjectPageData;
  try {
    const [project, areas, members, decisions, meetings] = await Promise.all([
      getProject(projectId),
      getProjectAreas(projectId),
      getProjectMembers(projectId),
      getProjectDecisions(projectId),
      getProjectMeetings(projectId),
    ]);
    const requestedAreaId = query.areaId ? Number(query.areaId) : project.publicAreaId;
    const currentArea = areas.find((area) => area.id === requestedAreaId);
    if (!currentArea) redirect(`/dashboard/projects/${projectId}?areaId=${project.publicAreaId}`);

    const relatedDecisions = decisions.filter(
      (decision) => decision.scope === 'PROJECT' || decision.area?.id === currentArea.id,
    );
    const contextDecisions = decisions.filter((decision) =>
      currentArea.type === 'PUBLIC' ? decision.scope === 'PROJECT' : decision.area?.id === currentArea.id,
    );
    const contextMeetings = meetings.filter((meeting) => meeting.areaId === currentArea.id);

    const requestedDecisionId = query.decisionId ? Number(query.decisionId) : undefined;
    const decisionFilterId =
      requestedDecisionId && relatedDecisions.some((decision) => decision.id === requestedDecisionId)
        ? requestedDecisionId
        : undefined;
    const canManageProject =
      hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.project.update) &&
      (project.currentUserRole === 'OWNER' || project.currentUserRole === 'MANAGER');
    const [initialMessages, areaMembers, memberCandidates] = await Promise.all([
      getProjectMessages(projectId, currentArea.id, decisionFilterId ? { decisionId: decisionFilterId } : {}),
      currentArea.type === 'PRIVATE' ? getAreaMembers(projectId, currentArea.id) : Promise.resolve([]),
      canManageProject && project.status === 'ACTIVE' ? getProjectMemberCandidates(projectId) : Promise.resolve([]),
    ]);
    const meetingCandidates =
      currentArea.type === 'PRIVATE' ? areaMembers.map((member) => member.user) : members.map((member) => member.user);
    pageData = {
      project,
      areas,
      currentArea,
      initialMessages,
      members,
      memberCandidates,
      areaMembers,
      relatedDecisions,
      contextDecisions,
      contextMeetings,
      meetingCandidates,
      decisionFilterId,
    };
  } catch (error) {
    if (error instanceof ProjectServerError && error.status === 404) notFound();
    throw error;
  }

  return (
    <ProjectDetailPage
      {...pageData}
      currentUser={{ id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl }}
      canCreateDecision={hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.create)}
      canManageProject={
        hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.project.update) &&
        (pageData.project.currentUserRole === 'OWNER' || pageData.project.currentUserRole === 'MANAGER')
      }
      canCreateMeeting={
        pageData.project.status === 'ACTIVE' &&
        pageData.currentArea.status === 'ACTIVE' &&
        hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.project.update) &&
        (pageData.currentArea.type === 'PUBLIC'
          ? pageData.project.currentUserRole === 'OWNER' || pageData.project.currentUserRole === 'MANAGER'
          : pageData.currentArea.currentUserRole === 'MANAGER')
      }
    />
  );
}
