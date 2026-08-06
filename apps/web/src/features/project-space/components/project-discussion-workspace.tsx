/**
 * 本文件组合真实讨论分区导航与已验证的项目聊天闭环。
 */
import Link from 'next/link';
import { Hash, LockKeyhole, Plus, UsersRound } from 'lucide-react';
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  ProjectChatMessagePage,
  ProjectDetail,
  ProjectMember,
  ProjectUserSummary,
} from '@workspace/contracts/projects';

import { ProjectSpaceChatPanel } from './project-space-chat-panel';
import { Button } from '@workspace/ui/components/button';

/** 项目讨论工作区属性。 */
type ProjectDiscussionWorkspaceProps = {
  /** 当前项目。 */
  project: ProjectDetail;
  /** 当前用户可见的讨论分区。 */
  areas: DiscussionAreaSummary[];
  /** 当前选中的讨论分区。 */
  currentArea: DiscussionAreaSummary;
  /** 当前私有分区的显式成员。 */
  currentAreaMembers: DiscussionAreaMember[];
  /** 当前项目全部成员。 */
  projectMembers: ProjectMember[];
  /** 当前分区首屏消息。 */
  initialMessages: ProjectChatMessagePage;
  /** 当前认证用户摘要。 */
  currentUser: ProjectUserSummary;
  /** 当前用户是否拥有创建决策权限。 */
  canCreateDecision: boolean;
};

/** 渲染可分享分区地址的项目聊天工作区。 */
export function ProjectDiscussionWorkspace(props: ProjectDiscussionWorkspaceProps) {
  const { project, areas, currentArea, currentAreaMembers, initialMessages, projectMembers, currentUser } = props;
  const canSend = project.status === 'ACTIVE' && currentArea.status === 'ACTIVE' && project.currentUserRole !== 'VIEWER';

  return (
    <div className="grid min-h-[44rem] min-w-0 flex-1 grid-cols-[minmax(0,1fr)] bg-white/18 md:min-h-[38rem] md:grid-cols-[12rem_minmax(0,1fr)] lg:h-full lg:min-h-0 lg:overflow-hidden">
      <aside className="min-w-0 border-b border-black/8 bg-white/30 p-3 md:min-h-0 md:overflow-y-auto md:border-r md:border-b-0" aria-label="项目讨论分区">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold">讨论群组</h2>
            <p className="mt-1 text-[10px] text-black/40">{areas.length} 个当前可见群组</p>
          </div>
          <Button type="button" variant="outline" size="icon" className="size-7 rounded-lg border-black/10 bg-white/55 shadow-none" aria-label="新建讨论群组">
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </div>

        <nav className="mt-3" aria-label="讨论分区列表">
          <ul className="flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-1 md:block md:space-y-1.5 md:overflow-visible">
            {areas.map((area) => {
              const isCurrent = area.id === currentArea.id;
              return (
                <li key={area.id} className="w-44 shrink-0 md:w-auto">
                  <Link
                    href={`/projects?projectId=${project.id}&areaId=${area.id}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`flex w-full items-center gap-2 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${
                      isCurrent ? 'border-project-accent/50 bg-project-accent-soft/75' : 'border-transparent hover:bg-white/55'
                    }`}
                  >
                    <span className={`grid size-7 shrink-0 place-items-center rounded-full ${isCurrent ? 'bg-project-accent' : 'bg-black/7'}`}>
                      {area.type === 'PUBLIC' ? <UsersRound className="size-3.5" aria-hidden /> : <LockKeyhole className="size-3.5" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{area.name}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-black/60">
                        {area.type === 'PUBLIC' ? '公共分区' : `${area.memberCount} 位成员`}
                      </span>
                    </span>
                    {area.type === 'PRIVATE' ? <Hash className="size-3 text-black/30" aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="min-h-0 min-w-0 overflow-hidden" aria-label={`${currentArea.name}聊天区`}>
        <ProjectSpaceChatPanel
          key={currentArea.id}
          projectId={project.id}
          project={project}
          area={currentArea}
          privateAreaMembers={currentAreaMembers}
          initialPage={initialMessages}
          projectMembers={projectMembers}
          currentUser={currentUser}
          canSend={canSend}
          canCreateDecision={props.canCreateDecision}
          readOnlyReason={getReadOnlyReason(project, currentArea)}
        />
      </div>
    </div>
  );
}

/** 根据项目、分区和成员角色返回只读原因。 */
function getReadOnlyReason(project: ProjectDetail, area: DiscussionAreaSummary): string {
  if (project.status !== 'ACTIVE') return '项目已关闭或归档，只能查看历史。';
  if (area.status !== 'ACTIVE') return '当前分区只读或已归档。';
  return '你在项目中是查看者。';
}
