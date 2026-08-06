/**
 * 本文件展示当前项目的真实基础信息、发起部门和项目成员。
 */
import { Building2, FolderKanban, UsersRound } from 'lucide-react';
import type { DecisionSummary } from '@workspace/contracts/decisions';
import type { MeetingSummary } from '@workspace/contracts/meetings';
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  ProjectDetail,
  ProjectMember,
  ProjectMemberCandidate,
} from '@workspace/contracts/projects';

import { ProjectCollaborationManagementSheet } from './project-collaboration-management-sheet';
import { ProjectCurrentAreaMembersCard } from './project-current-area-members';
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from '@workspace/ui/components/avatar';

/** 项目概览面板属性。 */
type ProjectOverviewPanelProps = {
  /** 当前项目。 */
  project: ProjectDetail;
  /** 当前用户可见的讨论分区。 */
  areas: DiscussionAreaSummary[];
  /** 当前选中的讨论分区。 */
  currentArea: DiscussionAreaSummary;
  /** 当前私有分区的显式成员。 */
  currentAreaMembers: DiscussionAreaMember[];
  /** 当前项目成员。 */
  members: ProjectMember[];
  /** 当前项目尚可添加的组织用户。 */
  memberCandidates: ProjectMemberCandidate[];
  /** 当前项目决策。 */
  decisions: DecisionSummary[];
  /** 当前项目会议。 */
  meetings: MeetingSummary[];
  /** 当前用户是否可以维护项目成员和私有小群组。 */
  canManage: boolean;
  /** 当前是否处于讨论模块，需要展示分区上下文。 */
  showCurrentArea: boolean;
};

/** 项目状态中文文案。 */
const statusText: Record<ProjectDetail['status'], string> = {
  ACTIVE: '进行中',
  CLOSED: '已关闭',
  ARCHIVED: '已归档',
};

/** 渲染项目空间右侧的真实项目级信息。 */
export function ProjectOverviewPanel({
  project,
  areas,
  currentArea,
  currentAreaMembers,
  members,
  memberCandidates,
  decisions,
  meetings,
  canManage,
  showCurrentArea,
}: ProjectOverviewPanelProps) {
  const resolvedDecisionCount = decisions.filter((decision) => decision.status === 'RESOLVED').length;
  const scheduledMeetingCount = meetings.filter((meeting) => meeting.status === 'SCHEDULED' || meeting.status === 'LIVE').length;
  const visibleMembers = members.slice(0, 30);

  return (
    <aside
      className="flex min-h-[34rem] min-w-0 shrink-0 flex-col border-t border-black/10 bg-white/35 lg:min-h-0 lg:shrink lg:overflow-y-auto lg:border-t-0 lg:border-l"
      aria-labelledby="project-overview-title"
    >
      <header className="flex items-start gap-3 px-4 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#292a27] text-white">
          <FolderKanban className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-black/40">当前项目</p>
          <h2 id="project-overview-title" className="mt-0.5 text-sm font-semibold">{project.title}</h2>
          <span className="mt-1.5 inline-flex rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
            {statusText[project.status]}
          </span>
        </div>
      </header>

      {showCurrentArea ? (
        <ProjectCurrentAreaMembersCard
          area={currentArea}
          projectMembers={members}
          privateAreaMembers={currentAreaMembers}
        />
      ) : null}

      <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-3 border-t border-black/8 px-4 py-4 text-xs">
        <dt className="text-black/40">负责人</dt>
        <dd className="truncate">{project.owner?.name || project.createdBy.name || `用户 ${project.createdBy.id}`}</dd>
        <dt className="text-black/40">成员</dt>
        <dd>{project.memberCount} 人</dd>
        <dt className="text-black/40">决策</dt>
        <dd>{resolvedDecisionCount} 项已决议 · {decisions.length - resolvedDecisionCount} 项其他状态</dd>
        <dt className="text-black/40">会议</dt>
        <dd>{scheduledMeetingCount} 场待开始或进行中</dd>
        <dt className="text-black/40">分区</dt>
        <dd>{areas.length} 个当前可见</dd>
      </dl>

      <section className="border-t border-black/8 px-4 py-4" aria-labelledby="department-title">
        <h3 id="department-title" className="flex items-center gap-1.5 text-xs font-semibold">
          <Building2 className="size-3.5" aria-hidden />
          发起部门
        </h3>
        <span className="mt-3 inline-flex rounded-full border border-black/10 bg-white/55 px-2 py-1 text-[10px] text-black/55">
          {project.department.name}
        </span>
      </section>

      <section className="border-t border-black/8 px-4 py-4" aria-labelledby="project-members-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="project-members-title" className="flex items-center gap-1.5 text-xs font-semibold">
            <UsersRound className="size-3.5" aria-hidden />
            项目成员
          </h3>
          {/* 管理协作范围的按钮 */}
          {canManage ? (
            <ProjectCollaborationManagementSheet
              project={project}
              areas={areas}
              members={members}
              memberCandidates={memberCandidates}
            />
          ) : null}
        </div>
        {visibleMembers.length ? (
          <AvatarGroup className="mt-3 flex-wrap gap-1.5 space-x-0" aria-label="项目成员头像组">
            {visibleMembers.map((member) => {
              const memberName = member.user.name || `用户 ${member.user.id}`;
              return (
                <Avatar key={member.id} title={memberName}>
                  <AvatarImage src={member.user.avatarUrl ?? undefined} alt={memberName} />
                  <AvatarFallback>{memberName.slice(0, 1)}</AvatarFallback>
                </Avatar>
              );
            })}
            {members.length > visibleMembers.length ? (
              <AvatarGroupCount
                title={`还有 ${members.length - visibleMembers.length} 位项目成员`}
                aria-label={`还有 ${members.length - visibleMembers.length} 位项目成员`}
                className="text-[10px]"
              >
                +{members.length - visibleMembers.length}
              </AvatarGroupCount>
            ) : null}
          </AvatarGroup>
        ) : (
          <p className="mt-3 text-xs text-black/40">暂无项目成员</p>
        )}
      </section>

      {project.description ? (
        <section className="border-t border-black/8 px-4 py-4" aria-labelledby="project-description-title">
          <h3 id="project-description-title" className="text-xs font-semibold">项目说明</h3>
          <p className="mt-2 text-xs leading-5 text-black/50">{project.description}</p>
        </section>
      ) : null}
    </aside>
  );
}
