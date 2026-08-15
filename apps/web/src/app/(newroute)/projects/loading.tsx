/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-08-05 12:13:55
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-08-05 17:17:35
 * @FilePath: \NextNest\apps\web\src\app\(newroute)\projects\loading.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件展示新版项目空间等待服务端数据期间的结构化骨架。
 */
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 渲染与项目空间三栏布局一致的加载状态。 */
export default function ProjectsLoading() {
  return (
    <section
      className="mt-6 grid min-h-[42rem] overflow-hidden rounded-[1.4rem] border border-white/70 bg-[#f8f7f2]/82 shadow-[0_18px_60px_rgba(41,42,39,0.08)] lg:grid-cols-[14rem_minmax(0,1fr)_16rem]"
      aria-label="项目空间正在加载"
      aria-busy="true"
    >
      <aside className="space-y-3 border-r border-black/10 p-3">
        <Skeleton className="h-9 w-full rounded-xl" />
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-16 w-full rounded-xl" />
        ))}
      </aside>
      <section className="space-y-4 p-5">
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-8 w-60 rounded-full" />
        <Skeleton className="h-[60rem] w-full rounded-2xl" />
      </section>
      <aside className="space-y-4 border-l border-black/10 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-24 w-full" />
      </aside>
    </section>
  );
}
