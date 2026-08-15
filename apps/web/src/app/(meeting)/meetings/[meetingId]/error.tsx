/**
 * 本文件处理会议房间运行时错误并提供恢复入口。
 */
'use client';

import { TriangleAlert } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';

/** 渲染会议房间错误状态。 */
export default function MeetingRoomError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <Alert variant="destructive" className="max-w-lg">
        <TriangleAlert aria-hidden />
        <AlertTitle>会议房间加载失败</AlertTitle>
        <AlertDescription className="space-y-4">
          <p>暂时无法读取会议数据，请稍后重试。</p>
          <Button type="button" variant="outline" onClick={reset}>
            重新加载
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}
