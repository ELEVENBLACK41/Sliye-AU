/**
 * 本文件展示当前用户真实参与项目的生命周期状态分布。
 */
import type { DashboardProjectStatusCount } from '@workspace/contracts/dashboard';

/** 项目状态展示配置。 */
const projectStatusPresentation = {
  ACTIVE: { label: '进行中', colorClassName: 'bg-decision-accent text-decision-ink' },
  CLOSED: { label: '已关闭', colorClassName: 'bg-decision-panel text-primary-foreground' },
  ARCHIVED: { label: '归档', colorClassName: 'bg-muted text-muted-foreground' },
} as const;

/** 项目状态卡片属性。 */
type DashboardProjectStatusPlaceholderProps = {
  /** 服务端返回的当前用户参与项目状态数量。 */
  statuses: DashboardProjectStatusCount[];
};

/** 渲染参考图风格的项目空间状态分段统计。 */
export function DashboardProjectStatusPlaceholder({ statuses }: DashboardProjectStatusPlaceholderProps) {
  const projectStatusData = statuses.map((item) => ({
    ...item,
    ...projectStatusPresentation[item.status],
  }));
  const totalProjects = projectStatusData.reduce((total, item) => total + item.count, 0);

  return (
    <section aria-labelledby="project-status-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="project-status-title" className="text-lg font-medium tracking-tight text-foreground">
            项目状态
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">我参与的全部项目空间</p>
        </div>
        <div className="text-right">
          <strong className="text-3xl leading-none font-light tracking-[-0.05em] text-foreground tabular-nums">
            {totalProjects}
          </strong>
          <span className="ml-1 text-xs text-muted-foreground">个</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1">
        {projectStatusData.map((item, index) => (
          <div key={item.status} className="min-w-0">
            <div
              className={`mb-2 text-[11px] font-semibold text-foreground/55 ${index > 0 ? 'border-l border-border pl-2' : 'pl-1'}`}
            >
              {totalProjects === 0 ? 0 : Math.round((item.count / totalProjects) * 100)}%
            </div>
            <div
              className={`flex h-11 min-w-0 items-center overflow-hidden rounded-xl px-2 text-[11px] font-medium whitespace-nowrap ${item.colorClassName}`}
              aria-label={`${item.label} ${item.count} 个`}
            >
              {item.label} · {item.count}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
