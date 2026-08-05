/**
 * 本文件负责项目内部讨论、决策和会议模块的切换与中央工作区组合。
 */
'use client';

import type { DecisionSummary } from '@workspace/contracts/decisions';
import type { MeetingSummary } from '@workspace/contracts/meetings';
import type {
  DiscussionAreaSummary,
  ProjectChatMessagePage,
  ProjectDetail,
  ProjectUserSummary,
} from '@workspace/contracts/projects';

import type { ProjectSectionKey } from '../types/project-space.type';
import { ProjectDecisionsWorkspace } from './project-decisions-workspace';
import { ProjectDiscussionWorkspace } from './project-discussion-workspace';
import { ProjectMeetingWorkspace } from './project-meeting-workspace';
import { ProjectSectionNavigation } from './project-section-navigation';

/** 项目中央工作区属性。 */
type ProjectWorkspacePanelProps = {
  /** 当前项目。 */
  project: ProjectDetail;
  /** 当前用户可见的讨论分区。 */
  areas: DiscussionAreaSummary[];
  /** 当前选中的讨论分区。 */
  currentArea: DiscussionAreaSummary;
  /** 当前分区首屏消息。 */
  initialMessages: ProjectChatMessagePage;
  /** 当前项目决策。 */
  decisions: DecisionSummary[];
  /** 当前项目会议。 */
  meetings: MeetingSummary[];
  /** 当前认证用户摘要。 */
  currentUser: ProjectUserSummary;
  /** 当前正在展示的项目模块。 */
  activeSection: ProjectSectionKey;
  /** 用户切换项目模块时触发的状态更新。 */
  onSectionChange: (section: ProjectSectionKey) => void;
};

/** 渲染项目标题、内部导航和当前选中的真实业务模块。 */
export function ProjectWorkspacePanel(props: ProjectWorkspacePanelProps) {
  const { project, activeSection, onSectionChange } = props;

  return (
    <section className="flex min-h-[31rem] min-w-0 flex-col bg-white/18 lg:h-full lg:min-h-0 lg:overflow-hidden" aria-labelledby="project-workspace-title">
      <header className="flex shrink-0 flex-col items-stretch justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="w-full min-w-0 sm:flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-black/45">项目空间</span>
            <span aria-hidden>/</span>
            <h1 id="project-workspace-title" className="truncate font-semibold">{project.title}</h1>
          </div>
          <p className="mt-1 text-[11px] text-black/40">
            {getProjectStatusText(project.status)} · {project.memberCount} 位成员 · {project.areaCount} 个讨论分区
          </p>
          <ProjectSectionNavigation activeSection={activeSection} onSectionChange={onSectionChange} />
        </div>
      </header>

      {activeSection === 'discussion' ? (
        <ProjectDiscussionWorkspace
          project={project}
          areas={props.areas}
          currentArea={props.currentArea}
          initialMessages={props.initialMessages}
          currentUser={props.currentUser}
        />
      ) : null}
      {activeSection === 'decisions' ? (
        <ProjectDecisionsWorkspace key={project.id} project={project} decisions={props.decisions} />
      ) : null}
      {activeSection === 'meetings' ? (
        <ProjectMeetingWorkspace meetings={props.meetings} />
      ) : null}
    </section>
  );
}

/** 返回项目生命周期的中文文案。 */
function getProjectStatusText(status: ProjectDetail['status']): string {
  return { ACTIVE: '进行中', CLOSED: '已关闭', ARCHIVED: '已归档' }[status];
}
