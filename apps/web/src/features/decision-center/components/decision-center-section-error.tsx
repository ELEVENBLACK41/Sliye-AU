/**
 * 本文件为决策中心独立流式区域提供可恢复的客户端错误提示。
 */
'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@workspace/ui/components/button';

/** 区域错误属性。 */
type DecisionCenterSectionErrorProps = {
  /** 失败区域名称。 */
  title: string;
};

/** 渲染单个业务区域的失败状态并允许刷新重试。 */
export function DecisionCenterSectionError({ title }: DecisionCenterSectionErrorProps) {
  /** 刷新当前路由以重新触发服务端读取。 */
  function handleRetry(): void {
    window.location.reload();
  }

  return <div className="rounded-[1.5rem] border border-dashed bg-background/45 p-6"><p className="text-sm font-medium">{title}暂时无法加载</p><p className="mt-1 text-xs text-muted-foreground">其他区域不受影响，可以单独重试当前页面请求。</p><Button className="mt-4 rounded-full" size="sm" variant="outline" onClick={handleRetry}><RefreshCw aria-hidden />重新加载</Button></div>;
}
