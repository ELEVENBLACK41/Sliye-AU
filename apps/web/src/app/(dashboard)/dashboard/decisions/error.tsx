/**
 * 本文件为决策模块提供中文运行时错误与重试入口。
 */
'use client';

import { AlertCircle } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 决策错误边界属性。 */
type DecisionsErrorProps = {
  /** Next.js 捕获到的页面异常。 */
  error: Error & { digest?: string };
  /** 重新执行当前路由渲染的回调。 */
  reset: () => void;
};

/** 渲染脱敏的决策加载失败状态。 */
export default function DecisionsError({ error, reset }: DecisionsErrorProps) {
  return (
    <main className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-md border bg-background p-8 text-center">
      <AlertCircle className="size-9 text-destructive" aria-hidden />
      <div>
        <h1 className="text-xl font-semibold">决策数据加载失败</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message || '系统暂时无法读取决策，请稍后重试。'}</p>
      </div>
      <Button onClick={reset}>重新加载</Button>
    </main>
  );
}
