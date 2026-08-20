/**
 * 本文件使用真实工作台摘要展示当前用户的个人参与统计。
 */
import { GitFork, Lightbulb, MessagesSquare } from 'lucide-react';
import type { DashboardParticipationStatistics } from '@workspace/contracts/dashboard';

/** 个人参与统计组件属性。 */
type DashboardKeyStatisticsPlaceholderProps = {
  /** 服务端返回的当前用户个人统计。 */
  participation: DashboardParticipationStatistics;
};

/** 按参考图样式渲染图标、大号数字和说明文字组成的三项统计。 */
export function DashboardKeyStatisticsPlaceholder({ participation }: DashboardKeyStatisticsPlaceholderProps) {
  const keyStatistics = [
    { label: '参与项目', value: participation.projectCount, icon: MessagesSquare },
    { label: '参与决策', value: participation.decisionCount, icon: GitFork },
    { label: '提交提案', value: participation.proposalCount, icon: Lightbulb },
  ] as const;

  return (
    <section aria-labelledby="key-statistics-title">
      <h2 id="key-statistics-title" className="sr-only">
        个人参与统计
      </h2>
      <dl className="grid grid-cols-3 gap-4">
        {keyStatistics.map((item) => {
          const Icon = item.icon;

          return (
            <div key={item.label} className="flex min-w-0 flex-col">
              <dt className="order-2 mt-1.5 truncate text-xs font-medium text-black/60">{item.label}</dt>
              <dd className="order-1 flex items-end gap-1.5 text-foreground">
                <span className="mb-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/5">
                  <Icon className="size-3.5 text-foreground/45" aria-hidden />
                </span>
                <span className="text-4xl leading-none font-light tracking-[-0.06em] tabular-nums sm:text-5xl">
                  {item.value}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
