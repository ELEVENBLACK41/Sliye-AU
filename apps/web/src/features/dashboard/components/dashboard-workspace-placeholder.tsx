/**
 * 本文件提供工作台主体 Bento 区域，按资料、分析、日程与状态列表划分静态业务面板。
 */
import type { ReactNode } from 'react';

import { Card } from '@workspace/ui/components/card';
import { DashboardMeetingSchedulePlaceholder } from './dashboard-meeting-schedule-placeholder';
import { DashboardMatterStatusPlaceholder } from './dashboard-matter-status-placeholder';
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
  /** 是否使用深色视觉。 */
  tone?: 'light' | 'dark' | 'yellow';
};

/** 使用共享 Card 组件渲染工作台业务面板外壳。 */
function WorkspacePanel({ children, className = '', label, tone = 'light' }: WorkspacePanelProps) {
  const toneClassName = {
    light: 'border-black/5 bg-white/55 text-[#252622]',
    dark: 'border-white/5 bg-[#30312e] text-white',
    yellow: 'border-[#f0c63b]/30 bg-[#ffd653] text-[#252622]',
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

/** 渲染面板标题与右上角操作位置占位。 */
function PanelHeadingPlaceholder({ dark = false }: { dark?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className={`h-4 w-28 rounded-full ${dark ? 'bg-white/20' : 'bg-black/15'}`} />
      <div className={`size-9 rounded-full ${dark ? 'bg-white/10' : 'bg-white/70'}`} />
    </div>
  );
}

/** 渲染左上角大幅资料卡占位。 */
function ProfilePanelPlaceholder() {
  return (
    <WorkspacePanel
      label="人员资料卡占位"
      className="relative min-h-72 overflow-hidden border-white/35 bg-[#d7d2c8] lg:min-h-[22rem]"
    >
      <DashboardProfileCardPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染左下角分组设置列表占位。 */
function SettingsPanelPlaceholder() {
  return (
    <WorkspacePanel label="分组设置列表占位" className="p-5">
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between border-b border-dashed border-black/10 pb-4 last:border-0 last:pb-0">
            <div className="h-3 w-32 rounded-full bg-black/12" />
            <div className="size-5 rounded-full bg-black/8" />
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

/** 渲染本年度正式决策柱状趋势卡*/
function ResolutionTrendPanelPlaceholder() {
  return (
    <WorkspacePanel label="本年度正式决议趋势" className="h-full min-h-72 p-5 xl:min-h-[22rem]">
      <DashboardResolutionTrendPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染全部已结束提案的采纳率环形统计卡。 */
function ProposalAdoptionPanelPlaceholder() {
  return (
    <WorkspacePanel label="全部已结束提案采纳率" className="h-full min-h-72 p-5 xl:min-h-[22rem]">
      <DashboardProposalAdoptionPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染中下方日程栅格占位。 */
function SchedulePanelPlaceholder() {
  return (
    <WorkspacePanel label="我的会议日程" className="min-h-[20rem] overflow-hidden p-5">
      <DashboardMeetingSchedulePlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染议事空间状态分布卡。 */
function MatterStatusPanelPlaceholder() {
  return (
    <WorkspacePanel label="议事空间状态分布" className="p-5 xl:h-48 xl:shrink-0">
      <DashboardMatterStatusPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染右侧深色事项列表占位。 */
function TaskListPanelPlaceholder() {
  return (
    <WorkspacePanel label="事项列表面板占位" tone="dark" className="min-h-[26rem] flex-1 p-5">
      <PanelHeadingPlaceholder dark />
      <div className="mt-6 space-y-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="grid grid-cols-[2.5rem_minmax(0,1fr)_1.25rem] items-center gap-3">
            <div className={`size-10 rounded-full ${index === 2 ? 'bg-white' : 'bg-white/10'}`} />
            <div className="space-y-2">
              <div className="h-3 w-4/5 rounded-full bg-white/20" />
              <div className="h-2.5 w-1/2 rounded-full bg-white/10" />
            </div>
            <div className={`size-4 rounded-full ${index < 2 ? 'bg-[#ffd653]' : 'bg-white/10'}`} />
          </div>
        ))}
      </div>
    </WorkspacePanel>
  );
}

/** 渲染与参考图一致的左、中、右三栏工作台主体结构。 */
export function DashboardWorkspacePlaceholder() {
  return (
    <section
      className="grid flex-1 gap-2.5 md:grid-cols-2 xl:grid-cols-[minmax(13rem,0.75fr)_minmax(14rem,0.775fr)_minmax(14rem,0.775fr)_minmax(15rem,0.8fr)] xl:grid-rows-[minmax(22rem,1fr)_minmax(20rem,1fr)]"
      aria-label="工作台主体占位"
    >
      <div className="min-w-0 xl:col-start-1 xl:row-start-1 [&>*]:h-full">
        <ProfilePanelPlaceholder />
      </div>

      <div className="min-w-0 xl:col-start-1 xl:row-start-2 [&>*]:h-full">
        <SettingsPanelPlaceholder />
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
        <MatterStatusPanelPlaceholder />
        <TaskListPanelPlaceholder />
      </div>
    </section>
  );
}
