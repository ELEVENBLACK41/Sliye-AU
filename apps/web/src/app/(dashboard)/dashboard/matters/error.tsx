/**
 * 本文件是议事路由的客户端错误边界。
 */
'use client';

import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

/** 展示安全中文错误并允许重试当前路由。 */
export default function MattersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden />
      <AlertTitle>议事加载失败</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>暂时无法读取议事数据，请稍后重试。</p>
        <Button variant="outline" onClick={reset}>
          重新加载
        </Button>
      </AlertDescription>
    </Alert>
  );
}
