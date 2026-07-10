/**
 * 本文件为权限与组织管理页面提供路由级加载骨架。
 */
import { Card, CardHeader } from '@workspace/ui/components/card';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染权限管理页面加载状态。 */
export default function AccessManagementLoading() {
  return (
    <main className="flex flex-col gap-4" aria-label="权限管理数据加载中">
      <Skeleton className="h-28 w-full rounded-md" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className="rounded-md shadow-none">
            <CardHeader className="gap-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <Skeleton className="h-80 w-full rounded-md" />
    </main>
  );
}
