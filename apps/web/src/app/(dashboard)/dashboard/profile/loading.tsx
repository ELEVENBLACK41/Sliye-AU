/**
 * 本文件提供个人信息页面的数据加载骨架。
 */
import { Card, CardContent, CardHeader } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染个人信息页面加载状态。 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-6">
          {[0, 1].map((item) => (
            <Card key={item} className="rounded-md shadow-none">
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-28 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="h-fit rounded-md shadow-none">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
