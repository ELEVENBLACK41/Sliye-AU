/**
 * 本文件组合工作台欢迎区，并用局部 Suspense 流式展示真实摘要数据。
 */
import { Suspense } from 'react';
import type { AuthUser } from '@workspace/contracts/auth';
import type { DashboardDecisionStatusCount, DashboardSummaryResponse } from '@workspace/contracts/dashboard';

import { DashboardKeyStatisticsPlaceholder } from './dashboard-key-statistics-placeholder';
import { DashboardSectionError } from './dashboard-section-error';
import { DashboardDistributionSkeleton, DashboardStatisticsSkeleton } from './dashboard-skeletons';
import { DashboardWelcomePlaceholder } from './dashboard-welcome-placeholder';

/** 工作台摘要区属性。 */
type DashboardSummaryPlaceholderProps = {
  /** 当前登录用户。 */
  user: AuthUser;
  /** 已在路由入口启动的摘要请求。 */
  data: Promise<DashboardSummaryResponse>;
};

/** 决策状态展示配置。 */
const decisionStatusPresentation = {
  DRAFT: { label: '草稿中', colorClassName: 'border border-border bg-background/45' },
  DISCUSSING: { label: '讨论中', colorClassName: 'bg-decision-accent text-decision-ink' },
  RESOLVED: { label: '已形成决议', colorClassName: 'bg-decision-panel text-primary-foreground' },
  CLOSED: { label: '已结束', colorClassName: 'border border-border bg-muted/70' },
} as const;

/** 按真实数量计算展示百分比，空样本统一返回零。 */
function calculatePercentage(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

/** 渲染真实决策状态图例与比例分段。 */
function DecisionDistributionPlaceholder({ statuses }: { statuses: DashboardDecisionStatusCount[] }) {
  const total = statuses.reduce((sum, item) => sum + item.count, 0);
  const items = statuses.map((item) => ({
    ...item,
    ...decisionStatusPresentation[item.status],
    percentage: calculatePercentage(item.count, total),
  }));

  return (
    <figure className="max-w-3xl" aria-label="全部决策状态分布">
      <figcaption className="sr-only">当前共 {total} 项可见决策</figcaption>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.status} className="min-w-0">
            <span className="block truncate text-xs font-medium text-foreground">{item.label}</span>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              {item.count} 项 · {item.percentage}%
            </span>
          </div>
        ))}
      </div>
      {total > 0 ? (
        <div className="mt-3 flex h-9 gap-1 overflow-hidden rounded-full" aria-hidden>
          {items
            .filter((item) => item.count > 0)
            .map((item) => (
              <span
                key={item.status}
                className={`min-w-1 rounded-full ${item.colorClassName}`}
                style={{ width: `${item.percentage}%` }}
              />
            ))}
        </div>
      ) : (
        <div className="mt-3 grid h-9 place-items-center rounded-full border border-dashed text-xs text-muted-foreground">
          暂无可见决策
        </div>
      )}
    </figure>
  );
}

/** 等待摘要数据并隔离决策分布失败状态。 */
async function DashboardDistributionStream({ data }: { data: Promise<DashboardSummaryResponse> }) {
  let summary: DashboardSummaryResponse;
  try {
    summary = await data;
  } catch {
    return <DashboardSectionError title="决策状态" compact />;
  }
  return <DecisionDistributionPlaceholder statuses={summary.decisionStatuses} />;
}

/** 等待摘要数据并隔离个人统计失败状态。 */
async function DashboardStatisticsStream({ data }: { data: Promise<DashboardSummaryResponse> }) {
  let summary: DashboardSummaryResponse;
  try {
    summary = await data;
  } catch {
    return <DashboardSectionError title="个人统计" compact />;
  }
  return <DashboardKeyStatisticsPlaceholder participation={summary.participation} />;
}

/** 渲染欢迎信息，并让横向进度和统计数字独立显示加载状态。 */
export function DashboardSummaryPlaceholder({ user, data }: DashboardSummaryPlaceholderProps) {
  const userName = user.name?.trim() || user.email;

  return (
    <section className="grid gap-7 py-9 lg:grid-cols-[minmax(0,1.6fr)_minmax(20rem,0.8fr)] lg:items-end lg:py-12">
      <div className="min-w-0 space-y-7">
        <DashboardWelcomePlaceholder userName={userName} />
        <Suspense fallback={<DashboardDistributionSkeleton />}>
          <DashboardDistributionStream data={data} />
        </Suspense>
      </div>

      <Suspense fallback={<DashboardStatisticsSkeleton />}>
        <DashboardStatisticsStream data={data} />
      </Suspense>
    </section>
  );
}
