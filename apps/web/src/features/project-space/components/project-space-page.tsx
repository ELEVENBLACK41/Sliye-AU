/**
 * 本文件组合新版项目空间的项目导航、当前业务工作区和项目概览。
 */
'use client';

import { useState } from 'react';
import type { DecisionSummary } from '@workspace/contracts/decisions';
import type { MeetingSummary } from '@workspace/contracts/meetings';
import type {
  DiscussionAreaSummary,
  ProjectChatMessagePage,
  ProjectDetail,
  ProjectMember,
  ProjectSummary,
  ProjectUserSummary,
} from '@workspace/contracts/projects';

import type { ProjectCreateDepartmentOption, ProjectSectionKey } from '../types/project-space.type';
import { ProjectListPanel } from './project-list-panel';
import { ProjectOverviewPanel } from './project-overview-panel';
import { ProjectWorkspacePanel } from './project-workspace-panel';

/** 新版项目空间组合页属性。 */
type ProjectSpacePageProps = {
  /** 当前用户可见的全部项目。 */
  projects: ProjectSummary[];
  /** 当前选中项目。 */
  project: ProjectDetail;
  /** 当前项目下用户可见的讨论分区。 */
  areas: DiscussionAreaSummary[];
  /** 当前选中的讨论分区。 */
  currentArea: DiscussionAreaSummary;
  /** 当前分区的首屏聊天消息。 */
  initialMessages: ProjectChatMessagePage;
  /** 当前项目成员。 */
  members: ProjectMember[];
  /** 当前项目决策摘要。 */
  decisions: DecisionSummary[];
  /** 当前项目会议摘要。 */
  meetings: MeetingSummary[];
  /** 当前认证用户的安全摘要。 */
  currentUser: ProjectUserSummary;
  /** 当前用户是否具备创建项目权限。 */
  canCreateProject: boolean;
  /** 当前用户创建项目时可以选择的启用部门。 */
  createDepartmentOptions: ProjectCreateDepartmentOption[];
};

/** 渲染接入真实业务数据后的项目空间。 */
export function ProjectSpacePage(props: ProjectSpacePageProps) {
  const [activeSection, setActiveSection] = useState<ProjectSectionKey>('discussion');

  return (
    <section
      className="relative mt-6 flex min-w-0 flex-none flex-col overflow-visible rounded-[1.4rem] border border-white/70 bg-[#f8f7f2]/82 shadow-[0_18px_60px_rgba(41,42,39,0.08)] lg:-mb-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:rounded-b-none"
      aria-label="项目空间"
    >
      <div className="grid min-w-0 flex-none grid-cols-[minmax(0,1fr)] lg:h-full lg:min-h-0 lg:flex-1 lg:grid-cols-[12.5rem_minmax(0,1fr)_14rem] lg:overflow-hidden xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        <ProjectListPanel
          projects={props.projects}
          currentProjectId={props.project.id}
          canCreate={props.canCreateProject}
          createDepartmentOptions={props.createDepartmentOptions}
        />
        <ProjectWorkspacePanel
          project={props.project}
          areas={props.areas}
          currentArea={props.currentArea}
          initialMessages={props.initialMessages}
          decisions={props.decisions}
          meetings={props.meetings}
          currentUser={props.currentUser}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />
        <ProjectOverviewPanel
          project={props.project}
          areas={props.areas}
          members={props.members}
          decisions={props.decisions}
          meetings={props.meetings}
        />
      </div>
    </section>
  );
}
