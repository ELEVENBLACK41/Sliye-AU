/**
 * 本文件为权限与组织管理页面提供中文错误状态和重新加载操作。
 */
'use client';

import { AlertCircle } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';

/** 权限管理错误边界属性。 */
type AccessManagementErrorProps = {
  /** Next.js 捕获到的页面异常。 */
  error: Error & { digest?: string };
  /** 重新渲染当前路由的回调。 */
  reset: () => void;
};

/** 渲染权限管理数据加载失败状态。 */
export default function AccessManagementError({ error, reset }: AccessManagementErrorProps) {
  return (
    <main className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-md border bg-background p-8 text-center">
      <AlertCircle className="size-9 text-destructive" aria-hidden />
      <div>
        <h1 className="text-xl font-semibold">权限管理数据加载失败</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || '系统暂时无法读取权限配置，请稍后重试。'}
        </p>
      </div>
      <Button onClick={reset}>重新加载</Button>
    </main>
  );
}
