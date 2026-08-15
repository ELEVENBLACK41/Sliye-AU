/**
 * 本文件是新版项目空间路由的客户端错误边界。
 */
'use client';

import { RefreshCw, TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

/** 展示脱敏错误信息，并允许重新执行当前路由的数据读取。 */
export default function ProjectsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="mt-6 grid min-h-[30rem] place-items-center rounded-[1.4rem] border border-white/70 bg-[#f8f7f2]/82 p-6">
      <Alert variant="destructive" className="max-w-lg bg-white/70">
        <TriangleAlert aria-hidden />
        <AlertTitle>项目空间加载失败</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>暂时无法读取项目协作数据，请稍后重试。若持续失败，可将请求时间提供给维护人员排查。</p>
          <Button type="button" variant="outline" onClick={reset}>
            <RefreshCw aria-hidden />
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    </section>
  );
}
