/**
 * 本文件组合议事管理员侧边栏，并把生命周期、成员和分区状态下沉到各自业务组件。
 */
'use client';

import { Settings2 } from 'lucide-react';
import type {
  DiscussionAreaMember,
  DiscussionAreaSummary,
  MatterDetail,
  MatterMember,
  MatterMemberCandidate,
} from '@workspace/contracts/matters';

import { MatterAreaManagement } from './matter-area-management';
import { MatterLifecycleManagement } from './matter-lifecycle-management';
import { MatterMemberManagement } from './matter-member-management';
import { Button } from '@workspace/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

/** 议事管理操作属性。 */
type MatterAdminActionsProps = {
  matter: MatterDetail;
  members: MatterMember[];
  memberCandidates: MatterMemberCandidate[];
  currentArea: DiscussionAreaSummary;
  areaMembers: DiscussionAreaMember[];
};

/** 渲染议事状态、成员与当前私有分区管理入口。 */
export function MatterAdminActions({
  matter,
  members,
  memberCandidates,
  currentArea,
  areaMembers,
}: MatterAdminActionsProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings2 aria-hidden />
          议事管理
        </Button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>议事管理</SheetTitle>
          <SheetDescription>管理权不会让你自动读取未加入的私有分区内容。</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">
          <Tabs defaultValue="lifecycle">
            <TabsList className="w-full">
              <TabsTrigger value="lifecycle">状态</TabsTrigger>
              <TabsTrigger value="members">成员</TabsTrigger>
              <TabsTrigger value="areas">分区</TabsTrigger>
            </TabsList>
            <TabsContent value="lifecycle" className="pt-4">
              <MatterLifecycleManagement matter={matter} />
            </TabsContent>
            <TabsContent value="members" className="pt-4">
              <MatterMemberManagement matter={matter} members={members} candidates={memberCandidates} />
            </TabsContent>
            <TabsContent value="areas" className="pt-4">
              <MatterAreaManagement
                matter={matter}
                members={members}
                currentArea={currentArea}
                areaMembers={areaMembers}
              />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
