/**
 * 本文件提供新版工作台的个人参与统计占位，后续用于接入真实汇总数据。
 */
import { GitFork, Lightbulb, MessagesSquare } from 'lucide-react';

/** 工作台个人参与统计的静态占位数据。 */
const keyStatistics = [
  { label: '参与项目', value: 12, icon: MessagesSquare },
  { label: '参与决策', value: 48, icon: GitFork },
  { label: '提交提案', value: 21, icon: Lightbulb },
] as const;

/** 按参考图样式渲染图标、大号数字和说明文字组成的三项统计。 */
export function DashboardKeyStatisticsPlaceholder() {
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
              <dd className="order-1 flex items-end gap-1.5 text-[#292a27]">
                <span className="mb-1.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-black/5">
                  <Icon className="size-3.5 text-black/45" aria-hidden />
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
