/**
 * 本文件为新版个人关系图谱提供覆盖权限校验与首屏数据读取的加载状态。
 */
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染与桌面图谱画布及右侧设置栏相匹配的结构化骨架。 */
export default function GraphLoading() {
  return (
    <section
      className="mt-6 grid min-h-[36rem] flex-1 overflow-hidden rounded-3xl border bg-card/80 shadow-sm lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_19rem]"
      aria-label="关系图谱正在加载"
      aria-busy="true"
    >
      <div className="relative min-h-[32rem] p-5 lg:min-h-0">
        <Skeleton className="h-10 w-full max-w-sm rounded-full" />
        <div className="absolute inset-0 grid place-items-center pt-16" aria-hidden>
          <Skeleton className="size-56 rounded-full opacity-50" />
        </div>
      </div>
      <aside className="space-y-6 border-t p-5 lg:border-t-0 lg:border-l">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-10 w-full rounded-lg" />
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-full rounded-full" />
          </div>
        ))}
      </aside>
    </section>
  );
}
