/**
 * 本文件由 AI Elements 官方 registry 引入，提供对话消息自动贴底、回到底部和导出能力。
 * 当前 AI 工作台仅使用 Conversation、ConversationContent 与 ConversationScrollButton；其余导出保留官方可组合能力。
 */
'use client';

import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';
import type { UIMessage } from 'ai';
import { ArrowDownIcon, DownloadIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback } from 'react';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';

export type ConversationProps = ComponentProps<typeof StickToBottom>;

/** 渲染带自动贴底行为的对话滚动容器。 */
export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn('relative flex-1 overflow-y-hidden', className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

/** 渲染对话容器内的消息内容区域。 */
export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn('flex flex-col gap-8 p-4', className)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  title?: string;
  description?: string;
  icon?: ReactNode;
};

/** 渲染没有消息时的可访问空状态。 */
export const ConversationEmptyState = ({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

/** 渲染用户离开消息底部后出现的回到底部按钮。 */
export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted',
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="size-4" />
      </Button>
    )
  );
};

/** 提取一条 AI SDK 消息中可导出的纯文本部分。 */
const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  'onClick'
> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

/** 使用 Markdown 将单条消息格式化为默认导出内容。 */
const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

/** 将 AI SDK 消息数组转换为可下载的 Markdown。 */
export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number
  ) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join('\n\n');

/** 渲染将当前消息记录下载为 Markdown 的按钮。 */
export const ConversationDownload = ({
  messages,
  filename = 'conversation.md',
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        'absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted',
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
