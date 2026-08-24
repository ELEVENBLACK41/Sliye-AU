/**
 * 本文件以一条可折叠状态轨道展示单个 AI Run 的运行与工具活动，并保留独立重试入口。
 */
'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  Ban,
  Check,
  ChevronDown,
  Circle,
  CircleAlert,
  CircleX,
  Clock3,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react';

import type { AiRunPublicSummary } from '@workspace/contracts/ai';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible';
import { cn } from '@workspace/ui/lib/utils';

import type {
  AiActivityDisplayState,
  AiActivityGroupView,
  AiActivityStepView,
} from '../utils/ai-activity-view';

/** 紧凑活动组属性。 */
export type AiActivityGroupProps = {
  /** 首次流与历史恢复共用的活动组数据。 */
  activity: AiActivityGroupView;
  /** 失败或取消终态创建关联新 Run。 */
  onRetry?: (run: AiRunPublicSummary) => Promise<void>;
  /** 上层正在提交重试时禁用重复操作。 */
  retrying?: boolean;
};

/** 活动状态对应的语义图标与文本类名。 */
type AiActivityStateVisual = {
  /** 使用 Lucide 的状态图标。 */
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** 图标和状态文本使用的语义颜色。 */
  className: string;
};

/** 状态视觉只使用项目语义 Token，并始终配合可读文本。 */
const ACTIVITY_STATE_VISUALS: Record<AiActivityDisplayState, AiActivityStateVisual> = {
  waiting: { icon: Clock3, className: 'text-muted-foreground' },
  running: { icon: LoaderCircle, className: 'text-primary' },
  success: { icon: Check, className: 'text-primary' },
  failed: { icon: CircleX, className: 'text-destructive' },
  cancelled: { icon: Ban, className: 'text-muted-foreground' },
  waiting_approval: { icon: CircleAlert, className: 'text-foreground' },
};

/** 渲染可折叠的活动组；成功态收敛，异常和等待用户状态保持展开。 */
export function AiActivityGroup({ activity, onRetry, retrying = false }: AiActivityGroupProps) {
  const visual = ACTIVITY_STATE_VISUALS[activity.state];
  const StatusIcon = visual.icon;
  const retryRun = activity.retryable ? activity.run : null;
  const canRetry = Boolean(retryRun && onRetry);

  return (
    <section
      className="mb-3 min-w-0"
      aria-label={`运行活动：${activity.title}`}
      aria-live={activity.state === 'running' || activity.state === 'waiting' ? 'polite' : undefined}
    >
      <Collapsible className="group/activity" defaultOpen={activity.defaultOpen}>
        <CollapsibleTrigger
          className={cn(
            'flex w-full min-w-0 items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2 text-left',
            'transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            'motion-reduce:transition-none',
          )}
          aria-label={`${activity.title}，${activity.statusLabel}，切换活动详情`}
        >
          <span
            className={cn(
              'grid size-4 shrink-0 place-items-center',
              visual.className,
              activity.state === 'running' && 'motion-safe:animate-spin motion-reduce:animate-none',
            )}
          >
            <StatusIcon aria-hidden className="size-4" />
          </span>
          <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
            <span className="block truncate text-sm font-medium text-foreground">{activity.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{activity.summary}</span>
          </span>
          <span className={cn('hidden shrink-0 text-xs sm:inline', visual.className)}>
            {activity.statusLabel}
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/activity:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1 motion-reduce:animate-none">
          <ol className="ml-5 border-l border-border/80 py-2 pl-5" aria-label="运行活动步骤">
            {activity.steps.map((step) => (
              <AiActivityStep key={step.id} step={step} />
            ))}
          </ol>
        </CollapsibleContent>
      </Collapsible>

      {activity.stableDetail || canRetry ? (
        <div
          className={cn(
            'mt-2 flex min-w-0 flex-wrap items-center gap-2 border-l-2 px-3 py-1.5 text-xs',
            activity.state === 'failed' ? 'border-destructive/60' : 'border-border',
          )}
          role="status"
        >
          <p className="min-w-0 flex-1 break-words text-muted-foreground">
            {activity.stableDetail ?? '本次运行可以基于原消息重新尝试。'}
          </p>
          {canRetry && retryRun && onRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retrying}
              onClick={() => void onRetry(retryRun)}
            >
              <RefreshCw
                aria-hidden
                className={cn(retrying && 'motion-safe:animate-spin motion-reduce:animate-none')}
              />
              {retrying ? '正在重试' : '重试本次运行'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** 渲染状态轨道中的一个真实步骤和按需展开的安全摘要。 */
function AiActivityStep({ step }: { step: AiActivityStepView }) {
  const visual = ACTIVITY_STATE_VISUALS[step.state];
  const StatusIcon = step.state === 'waiting' ? Circle : visual.icon;
  const stableErrorCode = resolveStableToolErrorCode(step.tool?.errorCode ?? null);

  return (
    <li className="relative min-w-0 py-1.5 first:pt-0 last:pb-0">
      <span
        className={cn(
          'absolute -left-[1.8rem] top-1.5 grid size-4 place-items-center bg-background',
          step.state === 'running' && 'motion-safe:animate-spin motion-reduce:animate-none',
        )}
      >
        <StatusIcon
          aria-hidden
          className={cn(
            'size-3.5',
            visual.className,
          )}
        />
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="min-w-0 break-words text-sm text-foreground">{step.label}</p>
          <span className={cn('text-xs', visual.className)}>{getStepStateLabel(step.state)}</span>
        </div>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{step.description}</p>
        {step.tool ? (
          <AiToolStepDetails step={step} stableErrorCode={stableErrorCode} />
        ) : null}
      </div>
    </li>
  );
}

/** 展示工具步骤允许公开的输入、结果、来源、耗时与稳定错误。 */
function AiToolStepDetails({
  step,
  stableErrorCode,
}: {
  step: AiActivityStepView;
  stableErrorCode: string | null;
}) {
  const tool = step.tool;
  if (!tool) return null;

  return (
    <div className="mt-2 min-w-0 border-l border-border/70 pl-3">
      <dl className="grid min-w-0 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <AiActivityDetail label="输入范围">
          {tool.inputSummary ? `决策 #${tool.inputSummary.decisionId}` : '由本次运行确定'}
        </AiActivityDetail>
        <AiActivityDetail label="来源数量">{tool.sourceIds.length} 项</AiActivityDetail>
        <AiActivityDetail label="执行耗时">
          {formatToolDuration(tool.durationMs, tool.state)}
        </AiActivityDetail>
        {stableErrorCode ? (
          <AiActivityDetail label="稳定错误">
            <code className="break-all text-destructive">{stableErrorCode}</code>
          </AiActivityDetail>
        ) : null}
      </dl>

      {tool.resultSummary ? (
        <div className="mt-2 min-w-0 space-y-2 border-t border-border/60 pt-2" aria-label="工具结果摘要">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 break-words font-medium text-foreground">
              {tool.resultSummary.decisionTitle}
            </p>
            <Badge variant="outline">{tool.resultSummary.decisionStatus}</Badge>
          </div>
          <dl className="grid min-w-0 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
            <AiActivityDetail label="所属项目">{tool.resultSummary.projectTitle}</AiActivityDetail>
            <AiActivityDetail label="讨论区域">
              {tool.resultSummary.areaName ?? '项目级决策'}
            </AiActivityDetail>
            <AiActivityDetail label="参与人数">{tool.resultSummary.participantCount} 人</AiActivityDetail>
            <AiActivityDetail label="读取决策">#{tool.resultSummary.decisionId}</AiActivityDetail>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

/** 渲染活动步骤中的一项安全详情。 */
function AiActivityDetail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{children}</dd>
    </div>
  );
}

/** 返回每个图标旁都可读取的状态文本。 */
function getStepStateLabel(state: AiActivityDisplayState): string {
  const labels: Record<AiActivityDisplayState, string> = {
    waiting: '等待中',
    running: '运行中',
    success: '已完成',
    failed: '失败',
    cancelled: '已取消',
    waiting_approval: '等待审批',
  };
  return labels[state];
}

/** 只允许稳定业务错误码进入活动组，避免渲染原始异常或内部地址。 */
function resolveStableToolErrorCode(errorCode: string | null): string | null {
  if (!errorCode) return null;

  const normalized = errorCode.trim();
  const isStableCode = /^[A-Z][A-Z0-9_]*(?:[._][A-Z0-9_]+)*$/u.test(normalized);
  return isStableCode && normalized.length <= 80 ? normalized : 'AI.TOOL_EXECUTION_FAILED';
}

/** 将工具耗时转换为快速阅读且不会暴露原始时间戳的文本。 */
function formatToolDuration(durationMs: number | null, state: AiActivityDisplayState): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) {
    return state === 'waiting' || state === 'running' || state === 'waiting_approval'
      ? '尚未完成'
      : '未记录';
  }

  if (durationMs < 1_000) return `${Math.round(durationMs)} 毫秒`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)} 秒`;
}
