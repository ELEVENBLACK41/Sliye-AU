/**
 * 本文件为新版个人关系图谱提供路由级客户端错误边界。
 */
'use client';

import { Network, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

/** 关系图谱错误边界接收的 Next.js 恢复参数。 */
type GraphErrorProps = {
  /** Next.js 捕获到的页面异常，仅用于错误边界协议，不直接向用户展示。 */
  error: Error & { digest?: string };
  /** 重新执行当前路由渲染的回调。 */
  reset: () => void;
};

/** 展示脱敏错误说明，并允许用户重新读取图谱快照。 */
export default function GraphError({ reset }: GraphErrorProps) {
  return (
    <section className="grid min-h-[30rem] flex-1 place-items-center py-12">
      <Alert className="max-w-lg bg-card/80" variant="destructive">
        <Network aria-hidden />
        <AlertTitle>关系图谱暂时无法打开</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>当前无法读取你的业务关系快照，请稍后重试。页面不会展示不完整或模拟的数据。</p>
          <Button type="button" variant="outline" onClick={reset}>
            <RefreshCw aria-hidden />
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  );
}
