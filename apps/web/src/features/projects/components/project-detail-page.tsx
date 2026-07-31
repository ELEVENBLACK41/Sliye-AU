/**
 * 本文件组合项目头部、可见分区导航、聊天主区和决策、会议、成员信息。
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole, MessageSquareText, UsersRound } from 'lucide-react';
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

import { ProjectAdminActions } from './project-admin-actions';
import { ProjectDecisionCreateAction } from './project-decision-create-action';
import { ProjectMeetingCreateAction } from './project-meeting-create-action';
import { ProjectChatPanel } from '../chat/components/project-chat-panel';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { cn } from '@workspace/ui/lib/utils';

/** 项目详情组合页属性。 */
type ProjectDetailPageProps = {
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
  currentUser: ProjectUserSummary;
  canCreateDecision: boolean;
  canManageProject: boolean;
  canCreateMeeting: boolean;
  decisionFilterId?: number;
};

/** 项目状态的中文文案。 */
const statusText: Record<ProjectDetail['status'], string> = {
  ACTIVE: '进行中',
  CLOSED: '已关闭',
  ARCHIVED: '已归档',
};

/** 渲染项目的三栏协作空间。 */
export function ProjectDetailPage({
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
  currentUser,
  canCreateDecision,
  canManageProject,
  canCreateMeeting,
  decisionFilterId,
}: ProjectDetailPageProps) {
  const canSend = project.status === 'ACTIVE' && currentArea.status === 'ACTIVE' && project.currentUserRole !== 'VIEWER';
  const contextMembers = currentArea.type === 'PRIVATE' ? areaMembers : members;

  return (
    <main className="space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/projects">
          <ArrowLeft aria-hidden />
          返回项目列表
        </Link>
      </Button>
      <Card className="rounded-md shadow-none">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">
                项目 #{project.id} · {project.department.name}
              </p>
              <CardTitle className="mt-1 text-2xl">{project.title}</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{statusText[project.status]}</Badge>
              {canCreateDecision && project.status === 'ACTIVE' ? (
                <ProjectDecisionCreateAction
                  projectId={project.id}
                  departmentId={project.department.id}
                  area={currentArea}
                />
              ) : null}
              {canCreateMeeting ? (
                <ProjectMeetingCreateAction
                  projectId={project.id}
                  area={currentArea}
                  decisions={relatedDecisions}
                  candidates={meetingCandidates}
                />
              ) : null}
              {canManageProject ? (
                <ProjectAdminActions
                  project={project}
                  members={members}
                  memberCandidates={memberCandidates}
                  currentArea={currentArea}
                  areaMembers={areaMembers}
                />
              ) : null}
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">{project.description || '暂无项目说明'}</p>
        </CardHeader>
      </Card>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_22rem]">
        <nav className="space-y-2" aria-label="讨论分区">
          <p className="px-2 text-xs font-medium text-muted-foreground">讨论分区</p>
          {areas.map((area) => (
            <Link
              key={area.id}
              href={`/dashboard/projects/${project.id}?areaId=${area.id}`}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted',
                area.id === currentArea.id && 'border-primary bg-primary/5',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                {area.type === 'PRIVATE' ? (
                  <LockKeyhole className="size-4 shrink-0" aria-hidden />
                ) : (
                  <MessageSquareText className="size-4 shrink-0" aria-hidden />
                )}
                <span className="truncate">{area.name}</span>
              </span>
              {area.type === 'PRIVATE' ? <Badge variant="outline">{area.memberCount}</Badge> : null}
            </Link>
          ))}
        </nav>

        <section className="min-w-0">
          <ProjectChatPanel
            key={`${currentArea.id}:${decisionFilterId ?? 'all'}`}
            projectId={project.id}
            area={currentArea}
            initialPage={initialMessages}
            currentUser={currentUser}
            canSend={canSend}
            initialDecisionId={decisionFilterId}
            readOnlyReason={
              project.status !== 'ACTIVE'
                ? '项目已关闭或归档，只能查看历史。'
                : currentArea.status !== 'ACTIVE'
                  ? '当前分区只读或已归档。'
                  : '你在项目中是查看者。'
            }
          />
        </section>

        <aside>
          <Tabs defaultValue="decisions">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="decisions">决策</TabsTrigger>
              <TabsTrigger value="meetings">会议</TabsTrigger>
              <TabsTrigger value="members">成员</TabsTrigger>
            </TabsList>
            <TabsContent value="decisions">
              <ResourceCard title={`${currentArea.name} · 决策（${contextDecisions.length}）`}>
                {contextDecisions.length ? (
                  <DecisionList project={project} decisions={contextDecisions} />
                ) : (
                  <EmptyText text="当前分区暂无决策" />
                )}
              </ResourceCard>
            </TabsContent>
            <TabsContent value="meetings">
              <ResourceCard title={`${currentArea.name} · 会议（${contextMeetings.length}）`}>
                {contextMeetings.length ? (
                  <MeetingList meetings={contextMeetings} />
                ) : (
                  <EmptyText text="当前分区暂无会议" />
                )}
              </ResourceCard>
            </TabsContent>
            <TabsContent value="members">
              <ResourceCard title={`${currentArea.name} · 成员（${contextMembers.length}）`}>
                <MemberList members={contextMembers} />
              </ResourceCard>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </main>
  );
}

/** 渲染项目决策摘要列表。 */
function DecisionList({ project, decisions }: { project: ProjectDetail; decisions: DecisionSummary[] }) {
  return (
    <ul className="space-y-2">
      {decisions.map((decision) => (
        <li key={decision.id} className="rounded-md border p-3">
          <Link
            className="font-medium hover:underline"
            href={`/dashboard/projects/${project.id}/decisions/${decision.id}`}
          >
            {decision.title}
          </Link>
          <div className="mt-2 flex gap-2">
            <Badge variant="secondary">{decision.status}</Badge>
            <Badge variant="outline">{decision.scope === 'AREA' ? decision.area?.name || '小组决策' : '项目级'}</Badge>
            <Button asChild size="sm" variant="ghost" className="h-6 px-2">
              <Link
                href={`/dashboard/projects/${project.id}?areaId=${decision.area?.id ?? project.publicAreaId}&decisionId=${decision.id}`}
              >
                相关讨论
              </Link>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 渲染当前用户可见的会议摘要列表。 */
function MeetingList({ meetings }: { meetings: MeetingSummary[] }) {
  return (
    <ul className="space-y-2">
      {meetings.map((meeting) => (
        <li key={meeting.id} className="rounded-md border p-3">
          <Link className="font-medium hover:underline" href={`/meetings/${meeting.id}`}>
            {meeting.title}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {meeting.areaName} · {meeting.decisions.length ? `${meeting.decisions.length} 项决策` : '普通项目会议'}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 渲染当前公共区或私有分区的成员摘要列表。 */
function MemberList({ members }: { members: Array<ProjectMember | DiscussionAreaMember> }) {
  return (
    <ul className="space-y-2">
      {members.map((member) => (
        <li key={member.id} className="flex items-center justify-between rounded-md border p-3">
          <span className="truncate text-sm">{member.user.name || `用户 ${member.user.id}`}</span>
          <Badge variant="outline">{member.role}</Badge>
        </li>
      ))}
    </ul>
  );
}

/** 渲染右侧资源卡片容器。 */
function ResourceCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="rounded-md shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersRound className="size-4" aria-hidden />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** 渲染右侧资源空状态。 */
function EmptyText({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}
