/**
 * 本文件提供工作台欢迎区、进度摘要和关键统计的静态占位布局。
 */
import { DashboardKeyStatisticsPlaceholder } from './dashboard-key-statistics-placeholder';
import { DashboardWelcomePlaceholder } from './dashboard-welcome-placeholder';

/** 全部决策的状态占比静态数据，后续由工作台接口返回值替换。 */
const decisionStatusDistribution = [
  {
    label: '草稿中',
    percentage: 20,
    colorClassName:
      'border border-black/10 bg-[repeating-linear-gradient(125deg,transparent_0,transparent_7px,rgba(255,255,255,0.95)_7px,rgba(255,255,255,0.95)_9px)]',
  },
  { label: '讨论中', percentage: 35, colorClassName: 'bg-[#ffd653]' },
  { label: '已形成决议', percentage: 30, colorClassName: 'bg-[#292a27] text-white' },
  { label: '已结束', percentage: 15, colorClassName: 'border border-black/20 bg-white/30', align: 'text-left' },
] as const;

/** 按参考图结构渲染标签位于上方、百分比位于色块内部的静态决策分布。 */
function DecisionDistributionPlaceholder() {
  const gridTemplateColumns = decisionStatusDistribution.map((item) => `${item.percentage}fr`).join(' ');

  return (
    <figure className="max-w-3xl" aria-label="全部决策状态分布">
      <div className="grid gap-2" style={{ gridTemplateColumns }}>
        {decisionStatusDistribution.map((item) => (
          <div key={item.label} className="min-w-0 space-y-2">
            <span
              className={`block whitespace-nowrap text-xs font-medium text-[#292a27] ${'align' in item ? item.align : ''}`}
            >
              {item.label}
            </span>
            <div
              className={`flex h-9 min-w-0 items-center rounded-full px-3 text-[11px] font-semibold ${item.colorClassName}`}
              aria-label={`${item.label} ${item.percentage}%`}
            >
              {item.percentage}%
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** 渲染欢迎信息、横向进度和统计数字区域。 */
export function DashboardSummaryPlaceholder() {
  return (
    <section className="dashboard-prototype-summary grid gap-7 py-9 lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.8fr)] lg:items-end lg:py-12">
      <div className="min-w-0 space-y-7">
        {/* 欢迎信息等等 */}
        <DashboardWelcomePlaceholder />
        {/* 百分比个人参与的决策 */}
        <DecisionDistributionPlaceholder />
      </div>

      {/* 右半区域的个人参与统计 */}
      <DashboardKeyStatisticsPlaceholder />
    </section>
  );
}
