/**
 * 本文件由 AI Elements conversation 组件裁剪并适配 NextNest，提供稳定的消息滚动容器。
 */
'use client';

import type { ComponentProps, ReactNode } from 'react';
import { useCallback } from 'react';
import { ArrowDownIcon } from 'lucide-react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';

/** AI Elements 对话滚动根容器属性。 */
export type ConversationProps = ComponentProps<typeof StickToBottom>;

/** 建立唯一纵向滚动区域，并在用户位于底部时跟随流式内容。 */
export function Conversation({ className, ...props }: ConversationProps) {
  return (
    <StickToBottom
      className={cn('relative min-h-0 flex-1 overflow-y-hidden', className)}
      initial="instant"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

/** 对话内容列表属性。 */
export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

/** 提供消息间距和底部留白，不创建第二个滚动容器。 */
export function ConversationContent({ className, ...props }: ConversationContentProps) {
  return <StickToBottom.Content className={cn('flex min-w-0 flex-col gap-6 p-4 md:p-6', className)} {...props} />;
}

/** 对话空状态属性。 */
export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  /** 空状态标题。 */
  title?: string;
  /** 空状态说明。 */
  description?: string;
  /** 可选的语义图标。 */
  icon?: ReactNode;
};

/** 展示没有历史消息时的可操作引导。 */
export function ConversationEmptyState({
  className,
  title = '还没有消息',
  description = '发送一条与当前决策形成过程相关的问题开始分析',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div
      className={cn('flex min-h-72 flex-1 flex-col items-center justify-center gap-3 p-8 text-center', className)}
      {...props}
    >
      {children ?? (
        <>
          {icon ? <div className="text-muted-foreground">{icon}</div> : null}
          <div className="space-y-1">
            <h2 className="text-sm font-medium">{title}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{description}</p>
          </div>
        </>
      )}
    </div>
  );
}

/** 滚动到最新消息按钮属性。 */
export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

/** 仅在用户离开底部时提供显式回到最新消息入口。 */
export function ConversationScrollButton({ className, ...props }: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  /** 请求滚动容器返回最新消息位置。 */
  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) {
    return null;
  }

  return (
    <Button
      aria-label="滚动到最新消息"
      className={cn('absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full', className)}
      onClick={handleScrollToBottom}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon aria-hidden className="size-4" />
    </Button>
  );
}
