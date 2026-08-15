/**
 * 本文件使用 shadcn Chart 展示全部已结束提案的采纳率，当前数据为接口接入前的静态占位。
 */
'use client';

import { ArrowUpRight } from 'lucide-react';
import { Cell, Pie, PieChart } from 'recharts';

import { Button } from '@workspace/ui/components/button';
import { ChartContainer, type ChartConfig } from '@workspace/ui/components/chart';

/** 全部已结束提案的静态采纳结果。 */
const proposalAdoptionData = [
  { status: 'accepted', label: '已采纳', value: 18, color: '#ffd653' },
  { status: 'rejected', label: '未采纳', value: 7, color: 'rgba(41, 42, 39, 0.12)' },
] as const;

/** shadcn Chart 使用的提案采纳结果配置。 */
const proposalAdoptionConfig = {
  accepted: {
    label: '已采纳',
    color: '#ffd653',
  },
  rejected: {
    label: '未采纳',
    color: 'rgba(41, 42, 39, 0.12)',
  },
} satisfies ChartConfig;

/** 渲染参考工作台风格的提案采纳率环形统计。 */
export function DashboardProposalAdoptionPlaceholder() {
  const totalProposals = proposalAdoptionData.reduce((total, item) => total + item.value, 0);
  const acceptedProposals = proposalAdoptionData.find((item) => item.status === 'accepted')?.value ?? 0;
  const adoptionRate = Math.round((acceptedProposals / totalProposals) * 100);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-medium tracking-tight text-[#292a27]">提案采纳率</h2>
          <p className="mt-1 text-xs text-black/40">全部已结束提案 · 共 {totalProposals} 份</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-10 rounded-full bg-white/75 text-[#292a27] shadow-sm hover:bg-white"
          aria-label="查看提案采纳详情"
        >
          <ArrowUpRight className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="relative mt-2 min-h-48 flex-1">
        <ChartContainer
          config={proposalAdoptionConfig}
          className="absolute inset-0 h-full w-full aspect-auto"
          initialDimension={{ width: 240, height: 192 }}
          aria-label={`提案采纳率 ${adoptionRate}%`}
        >
          <PieChart accessibilityLayer>
            <Pie
              data={proposalAdoptionData}
              dataKey="value"
              nameKey="status"
              innerRadius={61}
              outerRadius={84}
              startAngle={90}
              endAngle={-270}
              paddingAngle={3}
              cornerRadius={8}
              stroke="transparent"
            >
              {proposalAdoptionData.map((item) => (
                <Cell key={item.status} fill={item.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
          <strong className="text-4xl leading-none font-light tracking-[-0.06em] text-[#292a27] tabular-nums">
            {adoptionRate}%
          </strong>
          <span className="mt-1 text-[11px] font-medium text-black/40">采纳率</span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2">
        {proposalAdoptionData.map((item) => (
          <div key={item.status} className="rounded-2xl bg-white/55 px-3 py-2.5">
            <dt className="flex items-center gap-2 text-xs text-black/45">
              <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
              {item.label}
            </dt>
            <dd className="mt-1 text-lg leading-none font-medium text-[#292a27] tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
