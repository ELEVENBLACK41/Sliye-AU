/**
 * 本文件展示议事空间状态分布，当前使用接口接入前的静态占位数据。
 */

/** 议事空间 ACTIVE、CLOSED、ARCHIVED 三种状态的静态统计。 */
const matterStatusData = [
  { label: '进行中', count: 13, percentage: 54, colorClassName: 'bg-[#ffd653] text-[#292a27]' },
  { label: '已关闭', count: 8, percentage: 33, colorClassName: 'bg-[#30312e] text-white' },
  { label: '归档', count: 3, percentage: 13, colorClassName: 'bg-black/25 text-[#292a27]' },
] as const;

/** 渲染参考图风格的议事空间状态分段统计。 */
export function DashboardMatterStatusPlaceholder() {
  const totalMatters = matterStatusData.reduce((total, item) => total + item.count, 0);
  const gridTemplateColumns = matterStatusData.map((item) => `${item.percentage}fr`).join(' ');

  return (
    <section aria-labelledby="matter-status-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="matter-status-title" className="text-lg font-medium tracking-tight text-[#292a27]">
            议事状态
          </h2>
          <p className="mt-0.5 text-xs text-black/40">全部议事空间</p>
        </div>
        <div className="text-right">
          <strong className="text-3xl leading-none font-light tracking-[-0.05em] text-[#292a27] tabular-nums">
            {totalMatters}
          </strong>
          <span className="ml-1 text-xs text-black/40">个</span>
        </div>
      </div>

      <div className="mt-4 grid gap-1" style={{ gridTemplateColumns }}>
        {matterStatusData.map((item, index) => (
          <div key={item.label} className="min-w-0">
            <div className={`mb-2 text-[11px] font-semibold text-black/55 ${index > 0 ? 'border-l border-black/20 pl-2' : 'pl-1'}`}>
              {item.percentage}%
            </div>
            <div
              className={`flex h-11 min-w-0 items-center overflow-hidden rounded-xl px-2 text-[11px] font-medium whitespace-nowrap ${item.colorClassName}`}
              aria-label={`${item.label} ${item.count} 个，占 ${item.percentage}%`}
            >
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
