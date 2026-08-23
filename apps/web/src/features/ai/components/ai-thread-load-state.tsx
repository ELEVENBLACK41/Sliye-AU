/**
 * 本文件展示 AI Thread 深链接仍在鉴权、加载或失败时的独立消息区状态。
 */

import { History } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Skeleton } from '@workspace/ui/components/skeleton';

/** 深链接恢复状态属性。 */
export type AiThreadLoadStateProps = {
  /** 是否仍在读取详情与首屏消息。 */
  loading: boolean;
  /** 当前稳定错误文案。 */
  error: string | null;
  /** 移动端打开会话历史。 */
  onOpenHistory: () => void;
  /** 重新读取当前 Thread。 */
  onRetry: () => void;
};

/** 渲染深链接 Thread 尚未通过 BFF 鉴权时的独立右栏状态。 */
export function AiThreadLoadState({
  loading,
  error,
  onOpenHistory,
  onRetry,
}: AiThreadLoadStateProps) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-background" aria-label="AI 会话恢复状态">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="lg:hidden"
          aria-label="打开 AI 会话历史"
          onClick={onOpenHistory}
        >
          <History aria-hidden />
        </Button>
        <div>
          <h2 className="font-semibold">恢复 AI 会话</h2>
          <p className="text-xs text-muted-foreground">正在重新校验当前决策访问权</p>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {error ? (
          <Alert variant="destructive" className="max-w-lg">
            <AlertTitle>当前会话无法打开</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                重新加载
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="w-full max-w-2xl space-y-6" aria-label="正在恢复 AI 会话" role="status">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="ml-auto h-20 w-2/3" />
            <Skeleton className="h-32 w-4/5" />
            {!loading ? <p className="text-center text-sm text-muted-foreground">正在准备会话……</p> : null}
          </div>
        )}
      </div>
    </section>
  );
}
