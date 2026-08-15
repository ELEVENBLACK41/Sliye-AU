/**
 * 本文件为新版会议中心提供路由级中文错误提示与恢复入口。
 */
'use client';

import { CalendarX2 } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 新版会议中心错误边界属性。 */
type MeetingsErrorProps = {
  /** Next.js 捕获到的页面异常。 */
  error: Error & { digest?: string };
  /** 重新执行当前路由渲染的回调。 */
  reset: () => void;
};

/** 渲染脱敏的新版会议中心加载失败状态。 */
export default function MeetingsError({ reset }: MeetingsErrorProps) {
  return (
    <section className="grid min-h-80 flex-1 place-items-center py-12 text-center">
      <div className="rounded-3xl border bg-card/80 p-8 shadow-sm">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <CalendarX2 aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold">会议中心暂时无法打开</h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          页面基础信息加载失败。你可以重新加载，已经打开的其他工作区不会受到影响。
        </p>
        <Button className="mt-5 rounded-full" variant="outline" onClick={reset}>
          重新加载
        </Button>
      </div>
    </section>
  );
}
