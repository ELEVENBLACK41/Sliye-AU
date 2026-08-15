/**
 * 本文件展示新版组织与权限路由切换和首屏数据读取期间的结构化骨架。
 */
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染与真实页面高度和层级一致的加载状态。 */
export default function MembersLoading() {
  return <section className="flex flex-1 flex-col gap-5 py-7 sm:py-9"><div><Skeleton className="h-3 w-36" /><Skeleton className="mt-3 h-10 w-64" /><Skeleton className="mt-3 h-4 w-full max-w-xl" /></div><div className="flex gap-2">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-10 w-24 rounded-xl" />)}</div><div className="overflow-hidden rounded-[1.75rem] border bg-organization-surface"><div className="border-b p-6"><Skeleton className="h-6 w-36" /><Skeleton className="mt-4 h-10 w-full rounded-full" /></div><div className="grid gap-4 p-6">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14 w-full rounded-xl" />)}</div></div></section>;
}
