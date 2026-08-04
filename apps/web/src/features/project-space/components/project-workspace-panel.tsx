/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-08-03 14:24:09
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-08-03 15:10:13
 * @FilePath: \NextNest\apps\web\src\features\project-space\components\project-workspace-panel.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件负责项目内部讨论、决策和会议模块的切换与中央工作区域组合。
 */
'use client';

import { useRef } from 'react';
import { Minus, Plus, Search } from 'lucide-react';

import type { ProjectSectionKey } from '../types/project-space.type';
import { DecisionMapCanvas } from './decision-map-canvas';
import type { DecisionMapCanvasHandle } from './decision-map-canvas';
import { ProjectDiscussionWorkspace } from './project-discussion-workspace';
import { ProjectMeetingWorkspace } from './project-meeting-workspace';
import { ProjectSectionNavigation } from './project-section-navigation';
import { Button } from '@workspace/ui/components/button';
import type { DecisionReplayController } from '../hooks/use-decision-replay';

/** 项目中央工作区域属性。 */
type ProjectWorkspacePanelProps = {
  /** 当前正在展示的项目模块。 */
  activeSection: ProjectSectionKey;
  /** 用户切换项目模块时触发的状态更新。 */
  onSectionChange: (section: ProjectSectionKey) => void;
  /** 中央 D3 画布消费的过程回放状态。 */
  replayController: DecisionReplayController;
};

/** 渲染项目标题、内部导航和当前选中的中央业务模块。 */
export function ProjectWorkspacePanel({ activeSection, onSectionChange, replayController }: ProjectWorkspacePanelProps) {
  const decisionMapRef = useRef<DecisionMapCanvasHandle | null>(null);

  return (
    <section className="flex min-h-[31rem] min-w-0 flex-col bg-white/18 lg:min-h-0" aria-labelledby="project-workspace-title">
      <header className="flex flex-col items-stretch justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="w-full min-w-0 sm:flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-black/45">项目空间</span>
            <span aria-hidden>/</span>
            <h1 id="project-workspace-title" className="font-semibold">产品体验升级计划</h1>
          </div>
          <p className="mt-1 text-[11px] text-black/40">进行中 · 12 位成员 · 3 个部门</p>
          <ProjectSectionNavigation activeSection={activeSection} onSectionChange={onSectionChange} />
        </div>

        {activeSection === 'decisions' ? (
          <div className="flex items-center gap-1.5" aria-label="关系画布工具">
            {/* <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg border-black/10 bg-white/45 text-xs shadow-none">全部状态</Button> */}
            <Button type="button" variant="outline" size="sm" onClick={() => decisionMapRef.current?.fitCanvas()} className="h-8 rounded-lg border-black/10 bg-white/45 text-xs shadow-none">适应画布</Button>
            <Button type="button" variant="outline" size="icon" onClick={() => decisionMapRef.current?.zoomOut()} className="size-8 rounded-lg border-black/10 bg-white/45 shadow-none" aria-label="缩小画布">
              <Search className="size-3.5" aria-hidden /><Minus className="size-2.5" aria-hidden />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => decisionMapRef.current?.zoomIn()} className="size-8 rounded-lg border-black/10 bg-white/45 shadow-none" aria-label="放大画布">
              <Search className="size-3.5" aria-hidden /><Plus className="size-2.5" aria-hidden />
            </Button>
          </div>
        ) : null}
      </header>
      {/* 群组展示区域 */}
      {activeSection === 'discussion' ? <ProjectDiscussionWorkspace /> : null}
      {/* 中间D3流程展示区域 */}
      {activeSection === 'decisions' ? (
        <DecisionMapCanvas
          ref={decisionMapRef}
          currentIndex={replayController.currentIndex}
          progress={replayController.progress}
        />
      ) : null}
      {/* 会议展示区域 */}
      {/* {activeSection === 'meetings' ? <ProjectMeetingWorkspace /> : null} */}
    </section>
  );
}
