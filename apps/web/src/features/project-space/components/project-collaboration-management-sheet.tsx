/**
 * 本文件为新版项目空间组合项目成员与私有小群组的统一管理入口。
 */
'use client';

import { Settings2, UsersRound } from 'lucide-react';
import type { DiscussionAreaSummary, ProjectDetail, ProjectMember, ProjectMemberCandidate } from '@workspace/contracts/projects';

import { ProjectGroupCreatePanel } from './project-group-create-panel';
import { ProjectMemberCreatePanel } from './project-member-create-panel';
import { Button } from '@workspace/ui/components/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

/** 新版协作范围管理 Sheet 属性。 */
type ProjectCollaborationManagementSheetProps = {
  /** 当前项目。 */
  project: ProjectDetail;
  /** 当前用户可见的讨论分区。 */
  areas: DiscussionAreaSummary[];
  /** 当前项目已有成员。 */
  members: ProjectMember[];
  /** 当前项目尚可添加的组织用户。 */
  memberCandidates: ProjectMemberCandidate[];
};

/** 通过同一新版入口组织“先加入项目，再进入小群组”的两层协作关系。 */
export function ProjectCollaborationManagementSheet({
  project,
  areas,
  members,
  memberCandidates,
}: ProjectCollaborationManagementSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-full border-black/10 bg-white/55 px-3 text-[10px] shadow-none">
          <Settings2 className="size-3.5" aria-hidden />
          管理协作范围
        </Button>
      </SheetTrigger>
      <SheetContent className="border-black/10 bg-project-surface sm:max-w-[32rem]">
        <SheetHeader className="border-b border-black/[0.07] px-5 py-5">
          <span className="mb-3 grid size-10 place-items-center rounded-2xl bg-project-accent text-project-ink">
            <UsersRound className="size-5" aria-hidden />
          </span>
          <SheetTitle className="text-xl font-semibold tracking-[-0.025em]">管理协作范围</SheetTitle>
          <SheetDescription className="text-xs leading-5 text-black/48">
            先把组织用户加入项目，再将项目成员分配到需要保密协作的私有小群组。
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="members" className="min-h-0 flex-1 gap-0">
          <TabsList className="mx-5 mt-4 grid h-9 grid-cols-2 rounded-xl bg-black/[0.045] p-1">
            <TabsTrigger value="members" className="rounded-lg text-xs">项目成员</TabsTrigger>
            <TabsTrigger value="groups" className="rounded-lg text-xs">私有小群组</TabsTrigger>
          </TabsList>
          <TabsContent value="members" className="min-h-0 overflow-y-auto px-5 py-5">
            <ProjectMemberCreatePanel
              projectId={project.id}
              isProjectActive={project.status === 'ACTIVE'}
              members={members}
              candidates={memberCandidates}
            />
          </TabsContent>
          <TabsContent value="groups" className="min-h-0 overflow-y-auto px-5 py-5">
            <ProjectGroupCreatePanel
              projectId={project.id}
              isProjectActive={project.status === 'ACTIVE'}
              areas={areas}
              members={members}
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
