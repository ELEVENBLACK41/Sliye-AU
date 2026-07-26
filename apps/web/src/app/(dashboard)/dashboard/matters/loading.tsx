/**
 * 本文件展示议事列表在 Server Component 等待期间的骨架。
 */
import { Card, CardContent, CardHeader } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染与议事列表尺寸接近的加载骨架。 */
export default function MattersLoading() {
  return (
    <main className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-4">
        <Skeleton className="h-28 w-full" />
        {[1, 2, 3].map((item) => (
          <Card key={item} className="rounded-md shadow-none">
            <CardHeader>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-4/5" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </section>
      <Skeleton className="h-96 w-full" />
    </main>
  );
}
