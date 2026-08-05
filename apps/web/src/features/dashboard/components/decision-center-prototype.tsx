/**
 * 本文件实现新版工作区中的决策中心视觉页面，后续由决策中心聚合接口替换示例数据。
 */
'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Plus, Search, Vote } from 'lucide-react';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { DecisionActivityHeatmap } from '@/features/decisions/components/decision-activity-heatmap';

/** 决策中心列表卡片在聚合接口中需要提供的最小展示字段。 */
type DecisionCenterItem = {
  /** 决策稳定主键，后续替换为数据库主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
  /** 决策所属项目空间。 */
  projectName: string;
  /** 项目级或私有小组级协作范围。 */
  scope: 'PROJECT' | 'AREA';
  /** 小组级决策的分区名称。 */
  areaName?: string;
  /** 决策所属部门。 */
  departmentName: string;
  /** 当前决策阶段。 */
  status: 'DRAFT' | 'DISCUSSING' | 'RESOLVED';
  /** 当前参与人数。 */
  participantCount: number;
  /** 提案数量，后续由聚合接口返回。 */
  proposalCount: number;
  /** 投票轮次数量，后续由聚合接口返回。 */
  voteRoundCount: number;
};

/** 仅用于新版 UI 预览的结构化数据，字段与后续聚合接口一一对应。 */
const previewDecisions: DecisionCenterItem[] = [
  { id: 101, title: '是否将移动端作为 2027 年第一优先级', projectName: '2027 产品路线规划', scope: 'PROJECT', departmentName: '产品部', status: 'DISCUSSING', participantCount: 12, proposalCount: 3, voteRoundCount: 1 },
  { id: 102, title: '统一设计系统迁移方案', projectName: '体验一致性专项', scope: 'AREA', areaName: '设计负责人小组', departmentName: '设计部', status: 'RESOLVED', participantCount: 7, proposalCount: 4, voteRoundCount: 2 },
  { id: 103, title: '季度预算调整原则', projectName: '经营复盘', scope: 'PROJECT', departmentName: '财务部', status: 'DRAFT', participantCount: 5, proposalCount: 0, voteRoundCount: 0 },
  { id: 104, title: '研发协作规范的评审方式', projectName: '工程效能改进', scope: 'AREA', areaName: '技术委员会', departmentName: '研发部', status: 'DISCUSSING', participantCount: 8, proposalCount: 2, voteRoundCount: 0 },
];

/** 决策状态的可读文案与视觉变体。 */
const statusMeta = {
  DRAFT: { label: '草稿中', variant: 'outline' },
  DISCUSSING: { label: '讨论中', variant: 'secondary' },
  RESOLVED: { label: '已形成决议', variant: 'default' },
} as const;

/** 渲染新版决策中心的高密度、可响应工作区。 */
export function DecisionCenterPrototype() {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'ALL' | 'PROJECT' | 'AREA'>('ALL');
  const decisions = useMemo(
    () => previewDecisions.filter((item) => (scope === 'ALL' || item.scope === scope) && `${item.title} ${item.projectName} ${item.departmentName}`.includes(query.trim())),
    [query, scope],
  );
  const discussingCount = previewDecisions.filter((item) => item.status === 'DISCUSSING').length;
  const resolvedCount = previewDecisions.filter((item) => item.status === 'RESOLVED').length;

  return (
    <section className="flex flex-1 flex-col gap-4 py-7 sm:py-9" aria-label="决策中心">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-[0.16em] text-[#555751]">DECISION ARCHIVE</p>
        <Button className="rounded-full bg-[#ffd653] text-[#292a27] hover:bg-[#ffd653]/85"><Plus aria-hidden />创建决策</Button>
      </div>

      <DecisionActivityHeatmap />

      <section className="grid gap-2.5 sm:grid-cols-3" aria-label="决策概览">
        <Metric label="讨论中" value={discussingCount} description="正在推进中的决策" dark />
        <Metric label="等待我的投票" value={3} description="请在截止时间前完成表决" />
        <Metric label="本周形成决议" value={resolvedCount} description="可以进入过程回放" />
      </section>

      <div className="grid min-w-0 gap-2.5 xl:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.75fr)]">
        <Card className="rounded-[1.75rem] border-black/5 bg-white/55 py-0 shadow-none backdrop-blur-sm">
          <CardHeader className="gap-3 px-5 pt-5 pb-3 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base text-[#292a27]">全部决策</CardTitle><div className="relative w-full sm:w-60"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input className="rounded-full border-black/10 bg-white/55 pl-9" placeholder="搜索决策、项目或部门" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></div></div>
            <div className="flex flex-wrap gap-2">{([['ALL', `全部 ${previewDecisions.length}`], ['PROJECT', '项目级'], ['AREA', '小组级']] as const).map(([value, label]) => <Button key={value} type="button" size="sm" variant={scope === value ? 'secondary' : 'outline'} className="rounded-full" onClick={() => setScope(value)}>{label}</Button>)}</div>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-6 sm:pb-6">
            <ul className="grid gap-2">{decisions.map((decision) => <DecisionItem key={decision.id} item={decision} />)}</ul>
          </CardContent>
        </Card>

        <aside className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1" aria-label="决策关注信息">
          <Card className="rounded-[1.75rem] border-white/5 bg-[#30312e] py-0 text-white shadow-none"><CardHeader className="px-5 pt-5 pb-3"><CardTitle className="text-base">需要关注</CardTitle></CardHeader><CardContent className="grid gap-4 px-5 pb-5"><Attention icon={<Vote aria-hidden />} title="移动端优先级等待投票" description="截止今日 18:00，还差 2 人达到法定人数。" /><Attention icon={<CalendarClock aria-hidden />} title="方案收敛会将在 14:30 开始" description="会议中的提案和投票会同步到该项决策过程。" /></CardContent></Card>
          <Card className="rounded-[1.75rem] border-black/5 bg-white/55 py-0 shadow-none backdrop-blur-sm"><CardHeader className="px-5 pt-5 pb-3"><CardTitle className="text-base">近期过程</CardTitle></CardHeader><CardContent className="grid gap-3 px-5 pb-5 text-xs text-[#5e605a]"><p><span className="mr-2 inline-block size-2 rounded-full bg-[#ffd653]" />投票已开启 · 移动端优先级</p><p><span className="mr-2 inline-block size-2 rounded-full bg-[#ffd653]" />新提案 · 季度预算调整原则</p><p><span className="mr-2 inline-block size-2 rounded-full bg-[#ffd653]" />会议录制已就绪 · 设计系统迁移方案</p></CardContent></Card>
        </aside>
      </div>
    </section>
  );
}

/** 渲染一个和当前设计语言一致的关键统计卡片。 */
function Metric({ label, value, description, dark = false }: { label: string; value: number; description: string; dark?: boolean }) {
  return <Card className={`rounded-[1.5rem] py-0 shadow-none ${dark ? 'border-white/5 bg-[#30312e] text-white' : 'border-black/5 bg-white/55 text-[#292a27]'}`}><CardContent className="p-4"><p className="text-xs opacity-65">{label}</p><p className="mt-2 text-2xl font-medium tracking-tight">{value}</p><p className="mt-1 text-xs opacity-65">{description}</p></CardContent></Card>;
}

/** 渲染可进入后续真实决策详情页的一项决策摘要。 */
function DecisionItem({ item }: { item: DecisionCenterItem }) {
  const status = statusMeta[item.status];
  return <li><Link href="#" className="grid gap-3 rounded-2xl border border-black/8 bg-white/45 p-4 transition-colors hover:bg-white/70 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><p className="truncate text-sm font-medium text-[#292a27]">{item.title}</p><div className="mt-2 flex flex-wrap gap-2 text-xs text-[#62645e]"><Badge variant="outline">{item.projectName}</Badge><span>{item.scope === 'AREA' ? `小组 · ${item.areaName}` : '项目级决策'}</span><span>{item.departmentName}</span></div></div><div className="flex items-center gap-2"><Badge variant={status.variant}>{status.label}</Badge><span className="text-xs text-[#62645e]">{item.participantCount} 人 · 提案 {item.proposalCount} · 投票 {item.voteRoundCount}</span></div><ArrowRight className="size-4 text-[#62645e]" aria-hidden /></Link></li>;
}

/** 渲染一条决策过程提醒。 */
function Attention({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="flex gap-3"><span className="mt-0.5 text-[#ffd653] [&>svg]:size-4">{icon}</span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-white/65">{description}</p></div></div>;
}
