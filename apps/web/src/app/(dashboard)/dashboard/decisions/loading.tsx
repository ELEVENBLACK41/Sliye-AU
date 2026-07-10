/**
 * 本文件为决策列表和详情提供路由级加载骨架。
 */
import { Card, CardContent, CardHeader } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染决策模块加载状态。 */
export default function DecisionsLoading() {
  return (
    <main className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" aria-label="决策数据加载中">
      <section className="grid gap-4">
        <Skeleton className="h-28 w-full rounded-md" />
        {[0, 1, 2].map((item) => (
          <Card key={item} className="rounded-md shadow-none">
            <CardHeader className="gap-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-4/5" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-3/5" />
            </CardContent>
          </Card>
        ))}
      </section>
      <Skeleton className="h-80 w-full rounded-md" />
    </main>
  );
}
