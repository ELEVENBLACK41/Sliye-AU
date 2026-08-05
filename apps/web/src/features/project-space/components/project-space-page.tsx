/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-08-03 12:20:00
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-08-05 11:31:29
 * @FilePath: \NextNest\apps\web\src\features\project-space\components\project-space-page.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件组合新版项目空间的项目导航、决策画布、上下文详情和过程回放区域。
 */
'use client';

import { useState } from 'react';

import { useDecisionReplay } from '../hooks/use-decision-replay';
import type { ProjectSectionKey } from '../types/project-space.type';
import { DecisionReplayTimeline } from './decision-replay-timeline';
import { ProjectListPanel } from './project-list-panel';
import { ProjectOverviewPanel } from './project-overview-panel';
import { ProjectWorkspacePanel } from './project-workspace-panel';

/** 渲染项目空间完整线框，并明确各业务区域未来的数据与交互边界。 */
export function ProjectSpacePage() {
  const [activeSection, setActiveSection] = useState<ProjectSectionKey>('discussion');
  const replayController = useDecisionReplay();

  return (
    <section className="relative mt-6 flex min-w-0 flex-none flex-col overflow-visible rounded-[1.4rem] border border-white/70 bg-[#f8f7f2]/82 shadow-[0_18px_60px_rgba(41,42,39,0.08)] lg:-mb-6 lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:rounded-b-none" aria-label="项目空间">
      <div className="grid min-w-0 flex-none grid-cols-[minmax(0,1fr)] lg:min-h-0 lg:flex-1 lg:grid-cols-[12.5rem_minmax(0,1fr)_14rem] xl:grid-cols-[14rem_minmax(0,1fr)_16rem]">
        {/* 左侧项目列表 */}
        <ProjectListPanel />
        {/* 决策地图画布 */}
        <ProjectWorkspacePanel
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          replayController={replayController}
        />
        {/* 右侧项目级详情与讨论频道快捷入口 */}
        <ProjectOverviewPanel />
      </div>
      {/* 决策回放只属于决策模块，并用于驱动后续 D3 动画。 */}
      {activeSection === 'decisions' ? <DecisionReplayTimeline controller={replayController} /> : null}
    </section>
  );
}
