/**
 * 本文件提供工作台欢迎区、进度摘要和关键统计的静态占位布局。
 */

/** 渲染一组关键统计数字的结构占位。 */
function StatisticPlaceholder() {
  return (
    <div className="min-w-0 space-y-2">
      <div className="h-10 w-20 max-w-full rounded-lg bg-black/15" />
      <div className="h-2.5 w-14 max-w-full rounded-full bg-black/10" />
    </div>
  );
}

/** 渲染欢迎信息、横向进度和统计数字区域。 */
export function DashboardSummaryPlaceholder() {
  return (
    <section className="grid gap-7 py-9 lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.8fr)] lg:items-end lg:py-12">
      <div className="min-w-0 space-y-7">
        <div className="space-y-3" aria-label="欢迎信息占位">
          <div className="h-9 w-80 max-w-[85%] rounded-lg bg-black/75 sm:h-11 sm:w-[28rem]" />
          <div className="h-3 w-44 rounded-full bg-black/10" />
        </div>

        <div className="grid max-w-3xl grid-cols-[5rem_5rem_minmax(8rem,1fr)_5rem] gap-2" aria-label="进度摘要占位">
          <div className="h-9 rounded-full bg-[#292a27]" />
          <div className="h-9 rounded-full bg-[#ffd653]" />
          <div className="h-9 rounded-full border border-black/10 bg-[repeating-linear-gradient(125deg,transparent_0,transparent_7px,rgba(255,255,255,0.95)_7px,rgba(255,255,255,0.95)_9px)]" />
          <div className="h-9 rounded-full border border-black/20 bg-white/20" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4" aria-label="关键统计占位">
        <StatisticPlaceholder />
        <StatisticPlaceholder />
        <StatisticPlaceholder />
      </div>
    </section>
  );
}
