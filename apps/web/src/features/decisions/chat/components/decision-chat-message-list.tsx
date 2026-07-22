/**
 * 本文件展示决策群聊消息、历史加载状态、一级回复入口和失败重试操作。
 */
'use client';

import { LoaderCircle, Reply, RotateCcw } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';
import type { DecisionChatViewMessage } from '../hooks/use-decision-chat';

/** 决策群聊消息列表属性。 */
type DecisionChatMessageListProps = {
  /** 当前按时间正序排列的消息。 */
  messages: DecisionChatViewMessage[];
  /** 当前登录用户主键，用于区分自己发送的消息。 */
  currentUserId: number;
  /** 当前用户是否可以选择回复目标。 */
  canSend: boolean;
  /** 是否仍有更早历史消息。 */
  hasMoreHistory: boolean;
  /** 是否正在加载更早历史。 */
  isLoadingHistory: boolean;
  /** 最近一次历史加载失败文案。 */
  historyError: string | null;
  /** 主动加载更早历史。 */
  onLoadOlder: () => void;
  /** 选择一级回复目标。 */
  onReply: (message: DecisionChatViewMessage) => void;
  /** 使用原幂等标识重试失败消息。 */
  onRetry: (clientMessageId: string) => void;
};

/** 渲染消息列表及历史加载入口。 */
export function DecisionChatMessageList({
  messages,
  currentUserId,
  canSend,
  hasMoreHistory,
  isLoadingHistory,
  historyError,
  onLoadOlder,
  onReply,
  onRetry,
}: DecisionChatMessageListProps) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex min-h-8 flex-col items-center justify-center gap-2">
        {hasMoreHistory ? (
          <Button type="button" variant="ghost" size="sm" disabled={isLoadingHistory} onClick={onLoadOlder}>
            {isLoadingHistory ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {isLoadingHistory ? '正在加载' : '加载更早消息'}
          </Button>
        ) : messages.length > 0 ? (
          <p className="text-xs text-muted-foreground">已经到达群聊起点</p>
        ) : null}
        {historyError ? (
          <p className="text-xs text-destructive" role="alert">
            {historyError}
          </p>
        ) : null}
      </div>

      {messages.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <p className="font-medium">还没有群聊消息</p>
          <p className="mt-1 text-sm text-muted-foreground">决策参与者发送的第一条消息会保存在这里。</p>
        </div>
      ) : (
        <ol className="space-y-4" aria-live="polite">
          {messages.map((message) => (
            <DecisionChatMessageItem
              key={message.id > 0 ? `message-${message.id}` : `client-${message.clientMessageId}`}
              message={message}
              isMine={message.author?.id === currentUserId}
              canReply={canSend}
              onReply={onReply}
              onRetry={onRetry}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/** 渲染一条普通、系统、发送中或发送失败消息。 */
function DecisionChatMessageItem({
  message,
  isMine,
  canReply,
  onReply,
  onRetry,
}: {
  /** 当前展示消息。 */
  message: DecisionChatViewMessage;
  /** 是否由当前登录用户发送。 */
  isMine: boolean;
  /** 是否展示回复操作。 */
  canReply: boolean;
  /** 选择回复目标。 */
  onReply: (message: DecisionChatViewMessage) => void;
  /** 重试失败消息。 */
  onRetry: (clientMessageId: string) => void;
}) {
  if (message.type === 'SYSTEM') {
    return <li className="text-center text-xs text-muted-foreground">{message.content || '系统消息已删除'}</li>;
  }

  const authorName = message.author?.name || `用户 ${message.author?.id ?? '-'}`;

  return (
    <li className={cn('flex items-start gap-2', isMine && 'flex-row-reverse')}>
      <Avatar size="sm" aria-label={authorName}>
        {message.author?.avatarUrl ? <AvatarImage src={message.author.avatarUrl} alt="" /> : null}
        <AvatarFallback>{getAvatarFallback(authorName)}</AvatarFallback>
      </Avatar>

      <div className={cn('max-w-[min(82%,42rem)]', isMine && 'text-right')}>
        <div className={cn('mb-1 flex items-center gap-2 text-xs text-muted-foreground', isMine && 'justify-end')}>
          <span>{authorName}</span>
          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
        </div>

        <div
          className={cn(
            'rounded-lg px-3 py-2 text-left text-sm shadow-xs',
            isMine ? 'bg-primary text-primary-foreground' : 'bg-muted',
            message.deliveryStatus === 'failed' && 'ring-1 ring-destructive',
          )}
        >
          {message.replyTo ? (
            <div
              className={cn(
                'mb-2 border-l-2 pl-2 text-xs',
                isMine
                  ? 'border-primary-foreground/40 text-primary-foreground/75'
                  : 'border-foreground/20 text-muted-foreground',
              )}
            >
              <p className="font-medium">
                {message.replyTo.author?.name || `用户 ${message.replyTo.author?.id ?? '-'}`}
              </p>
              <p className="mt-0.5 line-clamp-2">{message.replyTo.content || '该消息已删除'}</p>
            </div>
          ) : null}
          <p className={cn('whitespace-pre-wrap break-words', !message.content && 'italic opacity-70')}>
            {message.content || '该消息已删除'}
          </p>
        </div>

        <div className={cn('mt-1 flex min-h-7 items-center gap-1', isMine && 'justify-end')}>
          {message.deliveryStatus === 'sending' ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LoaderCircle className="size-3 animate-spin" aria-hidden />
              发送中
            </span>
          ) : null}
          {message.deliveryStatus === 'failed' && message.clientMessageId ? (
            <>
              <span className="text-xs text-destructive">{message.errorMessage || '发送失败'}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-destructive"
                onClick={() => onRetry(message.clientMessageId as string)}
              >
                <RotateCcw aria-hidden />
                重试
              </Button>
            </>
          ) : null}
          {canReply && message.deliveryStatus === 'sent' && message.id > 0 ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onReply(message)}>
              <Reply aria-hidden />
              回复
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** 生成头像缺省文字。 */
function getAvatarFallback(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '用';
}

/** 把 ISO 时间转换为紧凑的中国地区消息时间。 */
function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
