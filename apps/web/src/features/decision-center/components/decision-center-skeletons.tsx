/**
 * 本文件提供决策中心三个业务区域的结构化加载占位。
 */
import { Card, CardContent, CardHeader } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染活动热力图区域骨架。 */
export function DecisionActivitySkeleton() {
  return <Card className="rounded-[1.75rem] bg-decision-surface py-0 shadow-none"><CardHeader className="px-6 py-5"><Skeleton className="h-5 w-36" /><Skeleton className="h-4 w-80 max-w-full" /></CardHeader><CardContent className="grid gap-4 border-t px-6 py-5 xl:grid-cols-[1fr_15rem]"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></CardContent></Card>;
}

/** 渲染过程分析区域骨架。 */
export function DecisionAnalyticsSkeleton() {
  return <section className="grid gap-3"><Skeleton className="h-7 w-40" /><div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-28 rounded-[1.35rem]" />)}</div><Skeleton className="h-56 rounded-[1.75rem]" /></section>;
}

/** 渲染跨项目档案区域骨架。 */
export function DecisionArchiveSkeleton() {
  return <Card className="rounded-[1.75rem] bg-decision-surface py-0 shadow-none"><CardHeader className="px-6 pt-5 pb-3"><Skeleton className="h-7 w-40" /><div className="grid gap-2 sm:grid-cols-[1fr_10rem_10rem]"><Skeleton className="h-9 rounded-full" /><Skeleton className="h-9 rounded-full" /><Skeleton className="h-9 rounded-full" /></div></CardHeader><CardContent className="grid gap-2 px-6 pb-5">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}</CardContent></Card>;
}
