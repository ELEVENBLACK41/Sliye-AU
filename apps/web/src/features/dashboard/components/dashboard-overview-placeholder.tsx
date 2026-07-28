/**
 * 本文件提供新版工作台 Bento Grid 内容骨架，所有数据、图表和日期区域均为静态占位。
 */
import type { ReactNode } from 'react';

/** 工作台面板的通用结构属性。 */
type DashboardPanelProps = {
  /** 面板内容。 */
  children: ReactNode;
  /** 面板附加布局样式。 */
  className?: string;
  /** 面板的无障碍名称。 */
  label: string;
};

/** 提供原型页面中一致的深色圆角面板外观。 */
function DashboardPanel({ children, className = '', label }: DashboardPanelProps) {
  return (
    <section
      aria-label={label}
      className={`min-w-0 rounded-[1.75rem] border border-white/6 bg-[#30322f] p-5 shadow-xl shadow-black/10 ${className}`}
    >
      {children}
    </section>
  );
}

/** 渲染面板标题与右侧操作区域占位。 */
function PanelHeaderPlaceholder({ action = true }: { action?: boolean }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="h-4 w-32 rounded-full bg-white/16" />
      {action ? <div className="h-7 w-20 rounded-full bg-white/8" /> : null}
    </div>
  );
}

/** 渲染一个图表分区及其下方统计值占位。 */
function MetricPlaceholder() {
  return (
    <div className="space-y-5">
      <div className="relative h-24 overflow-hidden rounded-xl border-b border-white/8">
        <div className="absolute right-[15%] bottom-4 left-[5%] h-px -rotate-3 bg-[#cfff54]/55" />
        <div className="absolute right-[8%] bottom-9 left-[18%] h-px rotate-6 bg-[#687df4]/55" />
        <div className="absolute bottom-3 left-1/2 h-14 border-l border-dashed border-white/15" />
      </div>
      <div className="space-y-3">
        <div className="h-3 w-20 rounded-full bg-white/10" />
        <div className="h-8 w-28 rounded-md bg-white/18" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-3 rounded-full bg-white/8" />
          <div className="h-3 rounded-full bg-white/8" />
        </div>
      </div>
    </div>
  );
}

/** 渲染右上角日期面板的纯占位网格。 */
function CalendarPlaceholder() {
  return (
    <section
      aria-label="日期面板占位"
      className="min-w-0 rounded-[1.75rem] border border-[#6f84ff]/40 bg-[#536ff3] p-5 shadow-xl shadow-[#536ff3]/10"
    >
      <PanelHeaderPlaceholder />
      <div className="mb-3 grid grid-cols-7 gap-2" aria-hidden>
        {Array.from({ length: 7 }).map((_, index) => (
          <div key={index} className="mx-auto size-2 rounded-full bg-white/30" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2" aria-label="日期格子占位">
        {Array.from({ length: 35 }).map((_, index) => (
          <div
            key={index}
            className={
              index === 17
                ? 'aspect-square rounded-full bg-[#cfff54]'
                : 'aspect-square rounded-full border border-white/8 bg-[#222a48]/85'
            }
          />
        ))}
      </div>
    </section>
  );
}

/** 渲染底部横向业务卡片占位。 */
function ActivityCardPlaceholder({ highlighted = false }: { highlighted?: boolean }) {
  return (
    <article
      className={
        highlighted
          ? 'min-h-40 rounded-2xl border border-[#7085ff]/60 bg-[#536ff3] p-4'
          : 'min-h-40 rounded-2xl border border-white/6 bg-white/6 p-4'
      }
    >
      <div className="flex items-start justify-between">
        <div className="flex -space-x-2">
          <div className="size-7 rounded-full border-2 border-current bg-white/25" />
          <div className="size-7 rounded-full border-2 border-current bg-white/15" />
        </div>
        <div className="size-7 rounded-full border border-white/10 bg-white/8" />
      </div>
      <div className="mt-10 space-y-3">
        <div className="h-3 w-2/3 rounded-full bg-white/18" />
        <div className="h-5 w-1/2 rounded-md bg-white/24" />
      </div>
    </article>
  );
}

/** 渲染与参考图一致的非对称工作台内容栅格。 */
export function DashboardOverviewPlaceholder() {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(19rem,0.8fr)]">
      <DashboardPanel label="主要数据面板占位" className="min-h-[22rem]">
        <PanelHeaderPlaceholder />
        <div className="grid gap-6 md:grid-cols-3 md:divide-x md:divide-white/8">
          <MetricPlaceholder />
          <div className="md:pl-6">
            <MetricPlaceholder />
          </div>
          <div className="md:pl-6">
            <MetricPlaceholder />
          </div>
        </div>
      </DashboardPanel>

      <CalendarPlaceholder />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        <DashboardPanel label="环形统计面板占位" className="min-h-32">
          <div className="flex items-center justify-between gap-5">
            <div className="flex-1 space-y-3">
              <div className="h-4 w-28 rounded-full bg-white/16" />
              <div className="h-3 w-40 max-w-full rounded-full bg-white/8" />
              <div className="h-3 w-24 rounded-full bg-white/8" />
            </div>
            <div className="size-20 shrink-0 rounded-full border-[0.55rem] border-[#cfff54] border-r-white/10" />
          </div>
        </DashboardPanel>

        <DashboardPanel label="进度面板占位" className="min-h-32">
          <PanelHeaderPlaceholder />
          <div className="h-3 overflow-hidden rounded-full bg-white/8">
            <div className="h-full w-3/4 rounded-full bg-[#cfff54]" />
          </div>
          <div className="mt-4 flex justify-between">
            <div className="h-3 w-16 rounded-full bg-white/8" />
            <div className="h-3 w-16 rounded-full bg-white/8" />
          </div>
        </DashboardPanel>
      </div>

      <DashboardPanel label="业务卡片列表占位" className="min-h-[19rem]">
        <PanelHeaderPlaceholder />
        <div className="mb-5 flex gap-2">
          <div className="h-8 w-16 rounded-full bg-[#cfff54]" />
          <div className="h-8 w-20 rounded-full bg-white/8" />
          <div className="h-8 w-28 rounded-full bg-white/8" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActivityCardPlaceholder highlighted />
          <ActivityCardPlaceholder />
          <ActivityCardPlaceholder />
          <article className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.025]">
            <div className="size-10 rounded-full border border-white/12 bg-white/6" aria-label="新增卡片占位" />
          </article>
        </div>
      </DashboardPanel>
    </div>
  );
}
