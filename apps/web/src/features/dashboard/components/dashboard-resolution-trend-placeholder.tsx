/**
 * 本文件使用 shadcn Chart 展示本年度正式决议数量趋势，当前数据为接口接入前的静态占位。
 */
'use client';

import { ArrowUpRight } from 'lucide-react';
import { Bar, BarChart, Cell, XAxis, YAxis } from 'recharts';

import { Button } from '@workspace/ui/components/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@workspace/ui/components/chart';

/** 2026 年截至 7 月的正式决议静态趋势数据。 */
const resolutionTrendData = [
  { month: '1月', resolutions: 3, isCurrent: false },
  { month: '2月', resolutions: 5, isCurrent: false },
  { month: '3月', resolutions: 4, isCurrent: false },
  { month: '4月', resolutions: 6, isCurrent: false },
  { month: '5月', resolutions: 5, isCurrent: false },
  { month: '6月', resolutions: 16, isCurrent: false },
  { month: '7月', resolutions: 7, isCurrent: true },
] as const;

/** shadcn Chart 使用的正式决议数据配置。 */
const resolutionTrendConfig = {
  resolutions: {
    label: '正式决议',
    color: '#30312e',
  },
} satisfies ChartConfig;

/** 渲染参考图风格的年度正式决议柱状趋势卡内容。 */
export function DashboardResolutionTrendPlaceholder() {
  const totalResolutions = resolutionTrendData.reduce((total, item) => total + item.resolutions, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold tracking-tight text-[#292a27]">决议趋势</p>
          <p className="mt-1 text-xs text-black/40">2026 年 · 截至 7 月</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 rounded-full bg-white/75 text-[#292a27] shadow-sm hover:bg-white"
          aria-label="查看决议趋势详情"
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <strong className="text-5xl leading-none font-light tracking-[-0.06em] text-[#292a27] tabular-nums">
          {totalResolutions}
        </strong>
        <p className="pb-1 text-xs leading-tight text-black/45">
          本年度
          <br />
          已形成决议
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
            tick={{ fill: 'rgba(41, 42, 39, 0.48)', fontSize: 11 }}
          />
          <YAxis hide domain={[0, 10]} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="resolutions" radius={999} maxBarSize={11}>
            {resolutionTrendData.map((item) => (
              <Cell key={item.month} fill={item.isCurrent ? '#ffd653' : 'var(--color-resolutions)'} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
