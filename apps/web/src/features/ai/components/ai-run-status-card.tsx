/**
 * 本文件展示公开 Run 摘要的生命周期状态，并为失败或取消终态提供显式重试入口。
 */
'use client';

import type { ComponentType } from 'react';
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Square,
} from 'lucide-react';

import type {
  AiRunCancellationReason,
  AiRunFailureReason,
  AiRunPublicSummary,
  AiRunStatus,
} from '@workspace/contracts/ai';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';

/** Run 状态卡支持的重试操作参数。 */
export type AiRunStatusCardProps = {
  /** 不含执行租约的浏览器公开 Run 摘要。 */
  run: AiRunPublicSummary;
  /** 失败或取消时创建关联新 Run 的回调。 */
  onRetry?: (runId: string) => void | Promise<void>;
  /** 上层正在提交重试时禁用重复操作。 */
  isRetrying?: boolean;
};

/** 单个 Run 状态的安全展示元数据。 */
type AiRunStatusView = {
  /** 状态标题。 */
  label: string;
  /** 状态补充说明。 */
  description: string;
  /** 使用 Lucide 的语义图标。 */
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** 状态图标与边框的语义类名。 */
  className: string;
};

/** 全部 Run 状态均具有明确、可恢复的用户反馈。 */
const RUN_STATUS_VIEW: Record<AiRunStatus, AiRunStatusView> = {
  QUEUED: {
    label: '等待运行',
    description: '消息已保存，正在等待开始生成回答。',
    icon: Clock3,
    className: 'border-border bg-muted/30 text-muted-foreground',
  },
  RUNNING: {
    label: '正在运行',
    description: '正在生成回答，离开后可从历史会话恢复进度。',
    icon: LoaderCircle,
    className: 'border-primary/30 bg-primary/5 text-primary',
  },
  WAITING_APPROVAL: {
    label: '等待审批',
    description: '本次运行已暂停，等待明确审批后才能继续。',
    icon: CircleAlert,
    className: 'border-border bg-muted/30 text-foreground',
  },
  CANCELLATION_REQUESTED: {
    label: '正在停止',
    description: '停止请求已经提交，正在等待当前执行安全结束。',
    icon: Square,
    className: 'border-border bg-muted/30 text-muted-foreground',
  },
  CANCELLED: {
    label: '已取消',
    description: '本次运行已停止；需要时可以基于原消息创建一次重试。',
    icon: Ban,
    className: 'border-border bg-muted/30 text-muted-foreground',
  },
  COMPLETED: {
    label: '已完成',
    description: '回答、工具结果与引用已保存到当前会话。',
    icon: CircleCheck,
    className: 'border-primary/30 bg-primary/5 text-primary',
  },
  FAILED: {
    label: '运行失败',
    description: '本次运行未完成；可查看稳定错误后重新尝试。',
    icon: CircleX,
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
};

/** 渲染安全 Run 状态，并且只在可重试终态显示操作入口。 */
export function AiRunStatusCard({ run, onRetry, isRetrying = false }: AiRunStatusCardProps) {
  const statusView = RUN_STATUS_VIEW[run.status];
  const StatusIcon = statusView.icon;
  const canRetry = run.status === 'FAILED' || run.status === 'CANCELLED';
  const stableDetail = formatRunStableDetail(run);
  const isActiveAnimation = run.status === 'RUNNING';

  return (
    <section
      className={cn(
        'mb-3 flex flex-wrap items-start gap-3 rounded-lg border px-3 py-2.5 text-sm',
        statusView.className,
      )}
      aria-label={`Run 状态：${statusView.label}`}
      aria-live={canRetry || run.status === 'CANCELLATION_REQUESTED' ? 'polite' : undefined}
    >
      <StatusIcon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          isActiveAnimation && 'motion-safe:animate-spin motion-reduce:animate-none',
        )}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{statusView.label}</p>
          <Badge variant="outline">Run {run.id.slice(0, 8)}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{statusView.description}</p>
        {stableDetail ? <p className="break-words text-xs">{stableDetail}</p> : null}
      </div>
      {canRetry && onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isRetrying}
          aria-label={`重试 Run ${run.id.slice(0, 8)}`}
          onClick={() => void onRetry(run.id)}
        >
          <RefreshCw
            aria-hidden
            className={cn(isRetrying && 'motion-safe:animate-spin motion-reduce:animate-none')}
          />
          {isRetrying ? '正在重试' : '重试'}
        </Button>
      ) : null}
    </section>
  );
}

/** 将公开失败或取消原因转成用户可理解且不泄露实现的稳定说明。 */
function formatRunStableDetail(run: AiRunPublicSummary): string | null {
  if (run.status === 'FAILED') {
    const reason = formatFailureReason(run.failureReason);
    return run.failureCode ? `${reason}（${run.failureCode}）` : reason;
  }

  if (run.status === 'CANCELLED' || run.status === 'CANCELLATION_REQUESTED') {
    return formatCancellationReason(run.cancellationReason);
  }

  return null;
}

/** 映射 Run 的稳定失败原因，不呈现模型或服务内部异常。 */
function formatFailureReason(reason: AiRunFailureReason | null): string {
  switch (reason) {
    case 'MODEL_ERROR':
      return '模型服务未能完成本次回答';
    case 'TOOL_ERROR':
      return '读取决策业务上下文时失败';
    case 'EXECUTION_LEASE_EXPIRED':
      return '本次运行未在有效时间内完成';
    case 'INTERNAL_ERROR':
    case null:
      return '运行暂时不可用';
  }
}

/** 映射 Run 的稳定取消原因，并区分用户停止与业务范围变化。 */
function formatCancellationReason(reason: AiRunCancellationReason | null): string {
  switch (reason) {
    case 'USER_REQUESTED':
      return '已按你的请求停止本次运行。';
    case 'SCOPE_CHANGED':
      return '当前决策的访问范围已变化，本次运行已安全停止。';
    case null:
      return '停止请求正在同步，稍后会恢复最终状态。';
  }
}
