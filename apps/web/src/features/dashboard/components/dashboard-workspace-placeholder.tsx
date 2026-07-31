/**
 * 本文件提供工作台主体 Bento 区域，按资料、分析、日程与状态列表划分静态业务面板。
 */
import type { ReactNode } from 'react';

import { Card } from '@workspace/ui/components/card';
import { DashboardAiAssistantPlaceholder } from './dashboard-ai-assistant-placeholder';
import { DashboardDecisionCardStack } from './dashboard-decision-card-stack';
import { DashboardMeetingSchedulePlaceholder } from './dashboard-meeting-schedule-placeholder';
import { DashboardProjectStatusPlaceholder } from './dashboard-project-status-placeholder';
import { DashboardProfileCardPlaceholder } from './dashboard-profile-card-placeholder';
import { DashboardProposalAdoptionPlaceholder } from './dashboard-proposal-adoption-placeholder';
import { DashboardResolutionTrendPlaceholder } from './dashboard-resolution-trend-placeholder';

/** 通用业务面板占位属性。 */
type WorkspacePanelProps = {
  /** 面板内部占位内容。 */
  children: ReactNode;
  /** 面板附加布局样式。 */
  className?: string;
  /** 面板语义名称。 */
  label: string;
  /** 面板使用的基础视觉色调。 */
  tone?: 'light' | 'dark' | 'yellow' | 'glass';
};

/** 使用共享 Card 组件渲染工作台业务面板外壳。 */
function WorkspacePanel({ children, className = '', label, tone = 'light' }: WorkspacePanelProps) {
  const toneClassName = {
    light: 'border-black/5 bg-white/55 text-[#252622]',
    dark: 'border-white/5 bg-[#30312e] text-white',
    yellow: 'border-[#f0c63b]/30 bg-[#ffd653] text-[#252622]',
    glass: 'border-white/70 bg-transparent text-[#252622]',
  }[tone];

  return (
    <Card
      aria-label={label}
      className={`gap-0 rounded-[1.75rem] py-0 shadow-none backdrop-blur-sm ${toneClassName} ${className}`}
    >
      {children}
    </Card>
  );
}

/** 渲染左上角大幅资料卡占位。 */
function ProfilePanelPlaceholder() {
  return (
    <WorkspacePanel
      label="人员资料卡占位"
      className="relative min-h-72 overflow-hidden border-white/35 bg-[#d7d2c8] lg:min-h-[22rem] xl:min-h-0"
    >
      <DashboardProfileCardPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染左下角毛玻璃 AI 决策助手卡片。 */
function AiAssistantPanelPlaceholder() {
  return <DashboardAiAssistantPlaceholder />;
}

/** 渲染本年度正式决策柱状趋势卡*/
function ResolutionTrendPanelPlaceholder() {
  return (
    <WorkspacePanel
      label="本年度正式决议趋势"
      className="h-full min-h-72 overflow-hidden p-5 xl:min-h-0 xl:p-[clamp(1rem,calc(2.2cqh+0.495rem),1.25rem)]"
    >
      <DashboardResolutionTrendPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染全部已结束提案的采纳率环形统计卡。 */
function ProposalAdoptionPanelPlaceholder() {
  return (
    <WorkspacePanel
      label="全部已结束提案采纳率"
      className="h-full min-h-72 overflow-hidden p-5 xl:min-h-0 xl:p-[clamp(1rem,calc(2.2cqh+0.495rem),1.25rem)]"
    >
      <DashboardProposalAdoptionPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染中下方日程栅格占位。 */
function SchedulePanelPlaceholder() {
  return (
    <WorkspacePanel
      label="我的会议日程"
      className="min-h-[20rem] overflow-hidden p-5 xl:min-h-0 xl:p-[clamp(1rem,calc(2.2cqh+0.495rem),1.25rem)]"
    >
      <DashboardMeetingSchedulePlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染项目空间状态分布卡。 */
function ProjectStatusPanelPlaceholder() {
  return (
    <WorkspacePanel label="项目空间状态分布" className="p-5 xl:h-48 xl:shrink-0">
      <DashboardProjectStatusPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染右侧深色决策卡片堆。 */
function DecisionCardStackPanel() {
  return (
    <WorkspacePanel label="可拖拽决策卡片堆" tone="dark" className="min-h-[26rem] flex-1 overflow-hidden xl:min-h-0">
      <DashboardDecisionCardStack />
    </WorkspacePanel>
  );
}

/** 渲染与参考图一致的左、中、右三栏工作台主体结构。 */
export function DashboardWorkspacePlaceholder() {
  return (
    <section
      className="grid flex-1 gap-2.5 md:grid-cols-2 xl:h-[max(36rem,calc(100dvh-22.5rem))] xl:flex-none xl:grid-cols-[minmax(13rem,0.75fr)_minmax(14rem,0.775fr)_minmax(14rem,0.775fr)_minmax(15rem,0.8fr)] xl:grid-rows-[minmax(0,1.1fr)_minmax(0,1fr)] xl:[container-type:size]"
      aria-label="工作台主体占位"
    >
      <div className="min-w-0 xl:col-start-1 xl:row-start-1 [&>*]:h-full">
        <ProfilePanelPlaceholder />
      </div>

      <div className="min-w-0 xl:z-10 xl:col-start-1 xl:row-start-2 xl:-mt-12 xl:h-[calc(100%+3rem)] [&>*]:h-full">
        <AiAssistantPanelPlaceholder />
      </div>
      {/* 中间区域得图标显示 */}
      <div className="min-w-0 xl:col-start-2 xl:row-start-1">
        <ResolutionTrendPanelPlaceholder />
      </div>
      {/* 中间右侧得环状图 */}
      <div className="min-w-0 xl:col-start-3 xl:row-start-1">
        <ProposalAdoptionPanelPlaceholder />
      </div>

      <div className="min-w-0 md:col-span-2 xl:col-start-2 xl:col-end-4 xl:row-start-2 [&>*]:h-full">
        <SchedulePanelPlaceholder />
      </div>

      <div className="grid min-w-0 gap-2.5 md:col-span-2 md:grid-cols-2 xl:col-start-4 xl:row-start-1 xl:row-end-3 xl:flex xl:h-full xl:flex-col">
        <ProjectStatusPanelPlaceholder />
        <DecisionCardStackPanel />
      </div>
    </section>
  );
}
