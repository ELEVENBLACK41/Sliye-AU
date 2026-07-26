/**
 * 本文件是议事详情路由，在服务端校验可见分区并并行准备首屏数据。
 */
import { notFound, redirect } from 'next/navigation';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';
import type { DecisionSummary } from '@workspace/contracts/decisions';
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  MatterChatMessagePage,
  MatterDetail,
  MatterMember,
  MatterMemberCandidate,
  MatterUserSummary,
} from '@workspace/contracts/matters';
import type { MeetingSummary } from '@workspace/contracts/meetings';

import { hasSystemPermission, requireServerPermission } from '@/features/auth/services/auth-server.service';
import { MatterDetailPage } from '@/features/matters/components/matter-detail-page';
import {
  getAreaMembers,
  getMatter,
  getMatterAreas,
  getMatterDecisions,
  getMatterMeetings,
  getMatterMemberCandidates,
  getMatterMembers,
  getMatterMessages,
  MatterServerError,
} from '@/features/matters/services/matters-server.service';

/** 议事详情异步路由与查询参数。 */
type MatterRouteProps = {
  params: Promise<{ matterId: string }>;
  searchParams: Promise<{ areaId?: string; decisionId?: string }>;
};

/** 页面完成授权和查询后使用的稳定渲染数据。 */
type MatterPageData = {
  matter: MatterDetail;
  areas: DiscussionAreaSummary[];
  currentArea: DiscussionAreaSummary;
  initialMessages: MatterChatMessagePage;
  members: MatterMember[];
  memberCandidates: MatterMemberCandidate[];
  areaMembers: DiscussionAreaMember[];
  decisions: DecisionSummary[];
  meetings: MeetingSummary[];
  meetingCandidates: MatterUserSummary[];
  decisionFilterId?: number;
};

/** 渲染议事三栏协作空间。 */
export default async function MatterRoutePage({ params, searchParams }: MatterRouteProps) {
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.matter.read);
  const [{ matterId: rawMatterId }, query] = await Promise.all([params, searchParams]);
  const matterId = Number(rawMatterId);
  if (!Number.isInteger(matterId) || matterId < 1) notFound();

  let pageData: MatterPageData;
  try {
    const [matter, areas, members, decisions, meetings] = await Promise.all([
      getMatter(matterId),
      getMatterAreas(matterId),
      getMatterMembers(matterId),
      getMatterDecisions(matterId),
      getMatterMeetings(matterId),
    ]);
    const requestedAreaId = query.areaId ? Number(query.areaId) : matter.publicAreaId;
    const currentArea = areas.find((area) => area.id === requestedAreaId);
    if (!currentArea) redirect(`/dashboard/matters/${matterId}?areaId=${matter.publicAreaId}`);

    const requestedDecisionId = query.decisionId ? Number(query.decisionId) : undefined;
    const decisionFilterId =
      requestedDecisionId && decisions.some((decision) => decision.id === requestedDecisionId)
        ? requestedDecisionId
        : undefined;
    const canManageMatter =
      hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.matter.update) &&
      (matter.currentUserRole === 'OWNER' || matter.currentUserRole === 'MANAGER');
    const [initialMessages, areaMembers, memberCandidates] = await Promise.all([
      getMatterMessages(matterId, currentArea.id, decisionFilterId ? { decisionId: decisionFilterId } : {}),
      currentArea.type === 'PRIVATE' ? getAreaMembers(matterId, currentArea.id) : Promise.resolve([]),
      canManageMatter && matter.status === 'ACTIVE' ? getMatterMemberCandidates(matterId) : Promise.resolve([]),
    ]);
    const meetingCandidates =
      currentArea.type === 'PRIVATE' ? areaMembers.map((member) => member.user) : members.map((member) => member.user);
    pageData = {
      matter,
      areas,
      currentArea,
      initialMessages,
      members,
      memberCandidates,
      areaMembers,
      decisions,
      meetings,
      meetingCandidates,
      decisionFilterId,
    };
  } catch (error) {
    if (error instanceof MatterServerError && error.status === 404) notFound();
    throw error;
  }

  return (
    <MatterDetailPage
      {...pageData}
      currentUser={{ id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl }}
      canCreateDecision={hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.decision.create)}
      canManageMatter={
        hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.matter.update) &&
        (pageData.matter.currentUserRole === 'OWNER' || pageData.matter.currentUserRole === 'MANAGER')
      }
      canCreateMeeting={
        pageData.matter.status === 'ACTIVE' &&
        pageData.currentArea.status === 'ACTIVE' &&
        hasSystemPermission(currentUser, SYSTEM_PERMISSIONS.matter.update) &&
        (pageData.currentArea.type === 'PUBLIC'
          ? pageData.matter.currentUserRole === 'OWNER' || pageData.matter.currentUserRole === 'MANAGER'
          : pageData.currentArea.currentUserRole === 'MANAGER')
      }
    />
  );
}
