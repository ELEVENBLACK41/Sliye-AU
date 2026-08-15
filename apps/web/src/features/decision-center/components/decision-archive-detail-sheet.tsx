/**
 * 本文件呈现决策中心档案的只读详情抽屉，不提供任何项目空间操作入口。
 */
'use client';

import { FileCheck2, Lightbulb, RefreshCw, UsersRound, Vote } from 'lucide-react';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@workspace/ui/components/sheet';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import type { DecisionCenterReadOnlyDetail } from '../types/decision-center.type';

/** 只读详情抽屉属性。 */
type DecisionArchiveDetailSheetProps = {
  /** 抽屉是否打开。 */
  open: boolean;
  /** 抽屉打开状态变化回调。 */
  onOpenChange: (open: boolean) => void;
  /** 已加载的过程快照。 */
  detail: DecisionCenterReadOnlyDetail | null;
  /** 当前是否正在加载。 */
  loading: boolean;
  /** 当前加载错误文案。 */
  error: string | null;
  /** 重新读取详情。 */
  onRetry: () => void;
};

/** 决策状态中文文案。 */
const statusLabels = {
  DRAFT: '草稿',
  DISCUSSING: '讨论中',
  RESOLVED: '已形成决议',
  CANCELLED: '已取消',
  ARCHIVED: '已归档',
} as const;

/** 渲染留在决策中心内部的完整只读过程快照。 */
export function DecisionArchiveDetailSheet({
  open,
  onOpenChange,
  detail,
  loading,
  error,
  onRetry,
}: DecisionArchiveDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-2xl">
        <SheetTitle className="sr-only">{detail?.decision.title ?? '决策过程档案详情'}</SheetTitle>
        <SheetDescription className="sr-only">
          查看决策的参与者、提案、投票、正式决议与完整事件时间线。
        </SheetDescription>
        {loading ? (
          <DetailSkeleton />
        ) : error ? (
          <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
            <div>
              <p className="text-sm font-medium">详情暂时无法加载</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button className="mt-4 rounded-full" variant="outline" onClick={onRetry}>
                <RefreshCw aria-hidden />
                重试
              </Button>
            </div>
          </div>
        ) : detail ? (
          <DetailContent detail={detail} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** 渲染已经加载完成的决策过程快照。 */
function DetailContent({ detail }: { detail: DecisionCenterReadOnlyDetail }) {
  const { decision } = detail;
  return (
    <>
      <SheetHeader className="border-b px-6 py-5 pr-14">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{statusLabels[decision.status]}</Badge>
          <Badge variant="outline">{decision.project.title}</Badge>
          <span className="text-xs text-muted-foreground">
            {decision.scope === 'AREA' ? `小组 · ${decision.area?.name ?? '未命名'}` : '项目级'}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-medium leading-7 tracking-tight">{decision.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {decision.description || '这项决策没有补充背景说明。'}
        </p>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <ProcessRail detail={detail} />
        <Tabs defaultValue="overview" className="mt-6">
          <TabsList variant="line" className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="proposals">提案 {detail.proposals.length}</TabsTrigger>
            <TabsTrigger value="votes">投票 {detail.voteRounds.length}</TabsTrigger>
            <TabsTrigger value="resolutions">决议 {detail.resolutions.length}</TabsTrigger>
            <TabsTrigger value="timeline">时间线 {detail.events.length}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5">
            <Overview detail={detail} />
          </TabsContent>
          <TabsContent value="proposals" className="mt-5">
            <ProposalList detail={detail} />
          </TabsContent>
          <TabsContent value="votes" className="mt-5">
            <VoteList detail={detail} />
          </TabsContent>
          <TabsContent value="resolutions" className="mt-5">
            <ResolutionList detail={detail} />
          </TabsContent>
          <TabsContent value="timeline" className="mt-5">
            <Timeline detail={detail} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/** 以四个真实阶段展示决策过程是否留有记录。 */
function ProcessRail({ detail }: { detail: DecisionCenterReadOnlyDetail }) {
  const stages = [
    { label: '讨论', complete: detail.decision.status !== 'DRAFT', icon: UsersRound },
    { label: '提案', complete: detail.proposals.length > 0, icon: Lightbulb },
    { label: '投票', complete: detail.voteRounds.length > 0, icon: Vote },
    { label: '决议', complete: detail.resolutions.length > 0, icon: FileCheck2 },
  ];
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="决策过程阶段">
      {stages.map((stage) => {
        const Icon = stage.icon;
        return (
          <li
            key={stage.label}
            className={`rounded-2xl border p-3 ${stage.complete ? 'bg-decision-accent-soft' : 'bg-muted/35 text-muted-foreground'}`}
          >
            <Icon className="size-4" aria-hidden />
            <p className="mt-2 text-xs font-medium">{stage.label}</p>
          </li>
        );
      })}
    </ol>
  );
}

/** 渲染参与范围和关键日期概览。 */
function Overview({ detail }: { detail: DecisionCenterReadOnlyDetail }) {
  const { decision } = detail;
  return (
    <div className="grid gap-4">
      <dl className="grid gap-2 sm:grid-cols-2">
        <Meta label="责任部门" value={decision.department.name} />
        <Meta label="负责人" value={decision.owner?.name ?? '未指定'} />
        <Meta label="创建时间" value={formatDateTime(decision.createdAt)} />
        <Meta label="正式收口" value={decision.decidedAt ? formatDateTime(decision.decidedAt) : '尚未形成最终决议'} />
      </dl>
      <section aria-labelledby="participants-title">
        <h3 id="participants-title" className="text-sm font-medium">
          参与者
        </h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {decision.participants.map((participant) => (
            <li key={participant.id} className="rounded-xl border p-3 text-sm">
              <p className="font-medium">{participant.user.name ?? `用户 ${participant.user.id}`}</p>
              <p className="mt-1 text-xs text-muted-foreground">{participant.role}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** 渲染提案档案。 */
function ProposalList({ detail }: { detail: DecisionCenterReadOnlyDetail }) {
  if (detail.proposals.length === 0) return <Empty label="这项决策没有提案记录。" />;
  return (
    <ul className="grid gap-2">
      {detail.proposals.map((proposal) => (
        <li key={proposal.id} className="rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{proposal.title}</p>
            <Badge variant="outline">{proposal.status}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{proposal.description || '无补充说明'}</p>
        </li>
      ))}
    </ul>
  );
}

/** 渲染投票轮次档案。 */
function VoteList({ detail }: { detail: DecisionCenterReadOnlyDetail }) {
  if (detail.voteRounds.length === 0) return <Empty label="这项决策没有发起投票。" />;
  return (
    <ul className="grid gap-2">
      {detail.voteRounds.map((round) => (
        <li key={round.id} className="rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{round.title}</p>
            <Badge variant="outline">{round.status}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {round.options.length} 个选项{round.result ? ` · ${round.result.totalBallots} 张有效票` : ' · 尚无最终统计'}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** 渲染正式决议档案。 */
function ResolutionList({ detail }: { detail: DecisionCenterReadOnlyDetail }) {
  if (detail.resolutions.length === 0) return <Empty label="这项决策尚未形成正式决议。" />;
  return (
    <ul className="grid gap-2">
      {detail.resolutions.map((resolution) => (
        <li key={resolution.id} className="rounded-2xl border bg-decision-accent-soft/45 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{resolution.title}</p>
            <Badge>{resolution.kind}</Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{resolution.content}</p>
          <time className="mt-3 block text-xs text-muted-foreground" dateTime={resolution.decidedAt}>
            {formatDateTime(resolution.decidedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** 渲染完整事件时间线。 */
function Timeline({ detail }: { detail: DecisionCenterReadOnlyDetail }) {
  if (detail.events.length === 0) return <Empty label="这项决策尚未写入过程事件。" />;
  return (
    <ol className="ml-2 border-l pl-5">
      {[...detail.events].reverse().map((event) => (
        <li key={event.id} className="relative pb-5 last:pb-0">
          <span className="absolute top-1.5 -left-[1.48rem] size-2 rounded-full bg-decision-accent ring-4 ring-background" />
          <p className="text-sm font-medium">{event.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {event.actor?.name ?? '系统'} · {formatDateTime(event.occurredAt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** 渲染一项概览元数据。 */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}

/** 渲染只读分区空状态。 */
function Empty({ label }: { label: string }) {
  return <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">{label}</p>;
}

/** 渲染详情抽屉骨架。 */
function DetailSkeleton() {
  return (
    <div className="grid gap-4 p-6" aria-label="正在加载决策档案">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-16 rounded-2xl" />
      <div className="grid grid-cols-4 gap-2">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <Skeleton className="h-52 rounded-2xl" />
    </div>
  );
}

/** 格式化日期时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
