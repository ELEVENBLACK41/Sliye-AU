/**
 * 本文件提供工作台主体 Bento 区域，按资料、分析、日程与状态列表划分静态业务面板。
 */
import type { ReactNode } from 'react';

import { Card } from '@workspace/ui/components/card';
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
      className="relative min-h-72 overflow-hidden bg-[linear-gradient(145deg,#bbbdb7,#e3e1d8)] lg:min-h-[22rem]"
    >
      <div className="absolute inset-x-[18%] top-[12%] bottom-0 rounded-t-[45%] bg-black/10" aria-label="主视觉图片占位" />
      <div className="absolute right-5 bottom-5 left-5 space-y-3 rounded-2xl bg-white/25 p-4 backdrop-blur-sm">
        <div className="h-4 w-32 rounded-full bg-white/65" />
        <div className="h-3 w-20 rounded-full bg-white/45" />
      </div>
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

/** 渲染本年度正式决议柱状趋势卡。 */
function ResolutionTrendPanelPlaceholder() {
  return (
    <WorkspacePanel label="本年度正式决议趋势" className="h-full min-h-72 p-5 xl:min-h-[22rem]">
      <DashboardResolutionTrendPlaceholder />
    </WorkspacePanel>
  );
}

/** 渲染环形统计面板占位。 */
function RingPanelPlaceholder() {
  return (
    <WorkspacePanel label="环形统计面板占位" className="h-full min-h-72 p-5 xl:min-h-[22rem]">
      <PanelHeadingPlaceholder />
      <div className="mt-7 flex items-center justify-center">
        <div className="flex size-36 items-center justify-center rounded-full border-[0.85rem] border-[#ffd653] border-l-black/10">
          <div className="h-7 w-20 rounded-lg bg-black/12" />
        </div>
      </div>
      <div className="mt-5 flex justify-center gap-3">
        <div className="size-10 rounded-full bg-white/70" />
        <div className="size-10 rounded-full bg-white/70" />
      </div>
    </WorkspacePanel>
  );
}

/** 渲染中下方日程栅格占位。 */
function SchedulePanelPlaceholder() {
  return (
    <WorkspacePanel label="日程面板占位" className="min-h-[20rem] overflow-hidden p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="h-7 w-20 rounded-full bg-white/70" />
        <div className="h-4 w-36 rounded-full bg-black/15" />
        <div className="h-7 w-20 rounded-full bg-white/70" />
      </div>

      <div className="mt-6 grid grid-cols-[3.5rem_repeat(6,minmax(4rem,1fr))] overflow-hidden" aria-label="日程表格占位">
        {Array.from({ length: 28 }).map((_, index) => (
          <div key={index} className="h-14 border-r border-b border-dashed border-black/10" />
        ))}
      </div>
      <div className="pointer-events-none relative -mt-40 h-40" aria-hidden>
        <div className="absolute top-4 left-[18%] h-12 w-[38%] rounded-xl bg-[#2f302d]" />
        <div className="absolute top-24 left-[48%] h-12 w-[36%] rounded-xl bg-white/90" />
      </div>
    </WorkspacePanel>
  );
}

/** 渲染右上角分段状态面板占位。 */
function StatusPanelPlaceholder() {
  return (
    <WorkspacePanel label="状态进度面板占位" className="p-5 xl:h-44 xl:shrink-0">
      <PanelHeadingPlaceholder />
      <div className="mt-7 grid grid-cols-[1.3fr_0.8fr_0.35fr] gap-1">
        <div className="h-10 rounded-xl bg-[#ffd653]" />
        <div className="h-10 rounded-xl bg-[#30312e]" />
        <div className="h-10 rounded-xl bg-black/25" />
      </div>
      <div className="mt-5 h-3 w-24 rounded-full bg-black/10" />
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

      <div className="min-w-0 xl:col-start-3 xl:row-start-1">
        <RingPanelPlaceholder />
      </div>

      <div className="min-w-0 md:col-span-2 xl:col-start-2 xl:col-end-4 xl:row-start-2 [&>*]:h-full">
        <SchedulePanelPlaceholder />
      </div>

      <div className="grid min-w-0 gap-2.5 md:col-span-2 md:grid-cols-2 xl:col-start-4 xl:row-start-1 xl:row-end-3 xl:flex xl:h-full xl:flex-col">
        <StatusPanelPlaceholder />
        <TaskListPanelPlaceholder />
      </div>
    </section>
  );
}
