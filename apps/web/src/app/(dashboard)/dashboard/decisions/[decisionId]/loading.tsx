/**
 * 本文件为决策详情、提案、投票和事件时间线提供路由级加载骨架。
 */
import { Card, CardContent, CardHeader } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染决策详情加载状态。 */
export default function DecisionDetailLoading() {
  return (
    <main className="flex flex-col gap-4" aria-label="决策详情加载中">
      <Skeleton className="h-9 w-28" />
      <Card className="rounded-md shadow-none">
        <CardHeader className="gap-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
      {[0, 1, 2, 3].map((item) => (
        <Card key={item} className="rounded-md shadow-none">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="grid gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
