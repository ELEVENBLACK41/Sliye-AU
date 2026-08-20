/**
 * 本文件使用 shadcn Chart 展示服务端返回的本年度正式决策趋势。
 */
'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts';
import type { DashboardResolutionTrendItem } from '@workspace/contracts/dashboard';

import { Button } from '@workspace/ui/components/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@workspace/ui/components/chart';

/** shadcn Chart 使用的正式决议数据配置。 */
const resolutionTrendConfig = {
  resolutions: {
    label: '正式决策',
    color: 'var(--decision-panel)',
  },
} satisfies ChartConfig;

/** 正式决策趋势组件属性。 */
type DashboardResolutionTrendPlaceholderProps = {
  /** 趋势所属公历年份。 */
  year: number;
  /** 趋势截至月份。 */
  throughMonth: number;
  /** 从一月到截至月份的真实数量。 */
  trend: DashboardResolutionTrendItem[];
};

/** 渲染参考图风格的年度正式决议柱状趋势卡内容。 */
export function DashboardResolutionTrendPlaceholder({
  year,
  throughMonth,
  trend,
}: DashboardResolutionTrendPlaceholderProps) {
  const resolutionTrendData = trend.map((item) => ({
    month: `${item.month}月`,
    resolutions: item.count,
    isCurrent: item.month === throughMonth,
  }));
  const totalResolutions = trend.reduce((total, item) => total + item.count, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xl font-medium tracking-tight text-foreground">决策趋势</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {year} 年 · 截至 {throughMonth} 月
          </p>
        </div>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="size-10 rounded-full bg-background/75 text-foreground shadow-sm hover:bg-background"
        >
          <Link href="/decisions" aria-label="查看决议趋势详情">
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <strong className="text-5xl leading-none font-light tracking-[-0.06em] text-foreground tabular-nums">
          {totalResolutions}
        </strong>
        <p className="pb-1 text-xs leading-tight text-muted-foreground">
          本年度
          <br />
          已形成决策
        </p>
      </div>

      <ChartContainer
        config={resolutionTrendConfig}
        className="mt-3 min-h-36 w-full flex-1 aspect-auto"
        initialDimension={{ width: 240, height: 176 }}
      >
        <BarChart accessibilityLayer data={resolutionTrendData} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
          <YAxis hide domain={[0, 'auto']} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="resolutions" radius={999} maxBarSize={11}>
            {resolutionTrendData.map((item) => (
              <Cell key={item.month} fill={item.isCurrent ? 'var(--decision-accent)' : 'var(--color-resolutions)'} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
