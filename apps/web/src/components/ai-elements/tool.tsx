/**
 * 本文件由 AI Elements tool 组件裁剪并适配 NextNest，用于承载结构化工具状态与安全摘要。
 */
'use client';

import type { ComponentProps, ReactNode } from 'react';
import type { DynamicToolUIPart, ToolUIPart } from 'ai';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react';

import { Badge } from '@workspace/ui/components/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible';
import { cn } from '@workspace/ui/lib/utils';

/** AI Elements 工具容器属性。 */
export type ToolProps = ComponentProps<typeof Collapsible>;

/** 渲染可展开的结构化工具卡容器。 */
export function Tool({ className, ...props }: ToolProps) {
  return <Collapsible className={cn('group not-prose mb-4 w-full rounded-md border', className)} {...props} />;
}

/** AI SDK 静态或动态工具部件联合。 */
export type ToolPart = ToolUIPart | DynamicToolUIPart;

/** AI Elements 工具头部属性。 */
export type ToolHeaderProps = {
  /** 面向用户的业务名称。 */
  title?: string;
  /** 自定义布局类名。 */
  className?: string;
} & (
  | { type: ToolUIPart['type']; state: ToolUIPart['state']; toolName?: never }
  | { type: DynamicToolUIPart['type']; state: DynamicToolUIPart['state']; toolName: string }
);

/** AI SDK 工具状态的中文标签。 */
const statusLabels: Record<ToolPart['state'], string> = {
  'approval-requested': '等待审批',
  'approval-responded': '审批已响应',
  'input-available': '运行中',
  'input-streaming': '等待中',
  'output-available': '已完成',
  'output-denied': '已取消',
  'output-error': '失败',
};

/** AI SDK 工具状态的语义图标。 */
const statusIcons: Record<ToolPart['state'], ReactNode> = {
  'approval-requested': <ClockIcon aria-hidden className="size-4 text-muted-foreground" />,
  'approval-responded': <CheckCircleIcon aria-hidden className="size-4 text-primary" />,
  'input-available': <ClockIcon aria-hidden className="size-4 animate-pulse motion-reduce:animate-none" />,
  'input-streaming': <CircleIcon aria-hidden className="size-4 text-muted-foreground" />,
  'output-available': <CheckCircleIcon aria-hidden className="size-4 text-primary" />,
  'output-denied': <XCircleIcon aria-hidden className="size-4 text-muted-foreground" />,
  'output-error': <XCircleIcon aria-hidden className="size-4 text-destructive" />,
};

/** 渲染工具状态徽标。 */
function ToolStatusBadge({ status }: { status: ToolPart['state'] }) {
  return (
    <Badge className="gap-1.5 rounded-full text-xs" variant="secondary">
      {statusIcons[status]}
      {statusLabels[status]}
    </Badge>
  );
}

/** 渲染业务名称、状态和展开指示器。 */
export function ToolHeader({ className, title, type, state, toolName, ...props }: ToolHeaderProps) {
  const derivedName = type === 'dynamic-tool' ? toolName : type.split('-').slice(1).join('-');

  return (
    <CollapsibleTrigger
      className={cn('flex w-full items-center justify-between gap-4 p-3 text-left', className)}
      {...props}
    >
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <WrenchIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{title ?? derivedName}</span>
        <ToolStatusBadge status={state} />
      </span>
      <ChevronDownIcon
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
      />
    </CollapsibleTrigger>
  );
}

/** AI Elements 工具展开正文属性。 */
export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

/** 渲染结构化工具安全摘要的展开区域。 */
export function ToolContent({ className, ...props }: ToolContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        'space-y-4 p-4 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}
