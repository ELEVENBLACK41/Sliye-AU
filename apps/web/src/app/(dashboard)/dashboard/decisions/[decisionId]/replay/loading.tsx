/**
 * 本文件为决策全过程回放页提供路由级加载骨架。
 */
import { Card, CardContent, CardHeader } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染决策回放加载状态。 */
export default function DecisionReplayLoading() {
  return (
    <main className="flex flex-col gap-4" aria-label="决策回放加载中">
      <Skeleton className="h-9 w-28" />
      <Card className="rounded-md shadow-none">
        <CardHeader className="gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-7 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </CardHeader>
      </Card>
      <Card className="rounded-md shadow-none">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="grid gap-5">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-28 w-full" />
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
