/**
 * 本文件为工作台独立流式区域提供可恢复的客户端错误提示。
 */
'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@workspace/ui/components/button';

/** 工作台区域错误属性。 */
type DashboardSectionErrorProps = {
  /** 失败区域名称。 */
  title: string;
  /** 是否使用紧凑卡片高度。 */
  compact?: boolean;
};

/** 渲染单个业务区域的失败状态并允许刷新重试。 */
export function DashboardSectionError({ title, compact = false }: DashboardSectionErrorProps) {
  /** 刷新当前路由以重新触发服务端并行读取。 */
  function handleRetry(): void {
    window.location.reload();
  }

  return (
    <div
      className={`grid place-items-center rounded-2xl border border-dashed bg-background/35 p-4 text-center ${compact ? 'min-h-24' : 'min-h-48'}`}
    >
      <div>
        <p className="text-sm font-medium">{title}暂时无法加载</p>
        <p className="mt-1 text-xs text-muted-foreground">其他区域不受影响。</p>
        <Button className="mt-3 rounded-full" size="sm" variant="outline" onClick={handleRetry}>
          <RefreshCw aria-hidden />
          重新加载
        </Button>
      </div>
    </div>
  );
}
