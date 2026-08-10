/**
 * 本文件处理决策中心路由级未预期异常，并提供恢复入口。
 */
'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@workspace/ui/components/button';

/** 决策中心错误页属性。 */
type DecisionCenterErrorProps = {
  /** Next.js 提供的当前错误。 */
  error: Error & { digest?: string };
  /** 重试当前路由分段。 */
  reset: () => void;
};

/** 渲染路由级错误恢复界面。 */
export default function DecisionCenterError({ error, reset }: DecisionCenterErrorProps) {
  return <section className="grid flex-1 place-items-center py-12 text-center"><div><p className="text-sm font-medium">决策中心暂时无法打开</p><p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">{error.message || '页面读取失败，请稍后重试。'}</p><Button className="mt-5 rounded-full" variant="outline" onClick={reset}><RefreshCw aria-hidden />重新加载</Button></div></section>;
}
