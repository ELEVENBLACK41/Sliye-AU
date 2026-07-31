/**
 * 本文件展示项目分区消息、业务关联和历史加载状态。
 */
'use client';

import { LoaderCircle, Reply } from 'lucide-react';

import type { ProjectChatViewMessage } from '../hooks/use-project-chat';
import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';

/** 分区消息列表属性。 */
type ProjectChatMessageListProps = {
  messages: ProjectChatViewMessage[];
  currentUserId: number;
  canSend: boolean;
  hasMoreHistory: boolean;
  isLoadingHistory: boolean;
  historyError: string | null;
  onLoadOlder: () => void;
  onReply: (message: ProjectChatViewMessage) => void;
};

/** 渲染消息列表、业务关联和历史加载状态。 */
export function ProjectChatMessageList(props: ProjectChatMessageListProps) {
  const { messages, currentUserId, canSend, hasMoreHistory, isLoadingHistory, historyError, onLoadOlder, onReply } =
    props;
  return (
    <div className="space-y-4 p-4">
      <div className="flex min-h-8 flex-col items-center gap-2">
        {hasMoreHistory ? (
          <Button variant="ghost" size="sm" disabled={isLoadingHistory} onClick={onLoadOlder}>
            {isLoadingHistory ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
            {isLoadingHistory ? '加载中…' : '加载更早消息'}
          </Button>
        ) : null}
        {historyError ? (
          <p className="text-xs text-destructive" role="alert">
            {historyError}
          </p>
        ) : null}
      </div>
      {messages.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center text-center">
          <p className="font-medium">当前分区还没有消息</p>
          <p className="mt-1 text-sm text-muted-foreground">第一条讨论会完整保存在这里。</p>
        </div>
      ) : (
        <ol className="space-y-4" aria-live="polite">
          {messages.map((message) => {
            const mine = message.author?.id === currentUserId;
            const authorName = message.author?.name || `用户 ${message.author?.id ?? '-'}`;
            if (message.type === 'SYSTEM')
              return (
                <li key={message.id} className="text-center text-xs text-muted-foreground">
                  {message.content || '系统消息'}
                </li>
              );
            return (
              <li
                key={message.id > 0 ? message.id : (message.clientMessageId ?? message.id)}
                className={cn('flex items-start gap-2', mine && 'flex-row-reverse')}
              >
                <Avatar size="sm">
                  <AvatarImage src={message.author?.avatarUrl ?? undefined} alt="" />
                  <AvatarFallback>{authorName.slice(0, 1)}</AvatarFallback>
                </Avatar>
                <div className={cn('max-w-[min(84%,44rem)]', mine && 'text-right')}>
                  <div
                    className={cn(
                      'mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground',
                      mine && 'justify-end',
                    )}
                  >
                    <span>{authorName}</span>
                    <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                    {message.meetingId ? <Badge variant="secondary">会议 #{message.meetingId}</Badge> : null}
                    {message.decision ? <Badge variant="outline">{message.decision.title}</Badge> : null}
                  </div>
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 text-left text-sm shadow-xs',
                      mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                      message.deliveryStatus === 'failed' && 'ring-1 ring-destructive',
                    )}
                  >
                    {message.replyTo ? (
                      <div className="mb-2 border-l-2 pl-2 text-xs opacity-75">
                        <p>{message.replyTo.author?.name || '原消息'}</p>
                        <p className="line-clamp-2">{message.replyTo.content || '该消息已删除'}</p>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">{message.content || '该消息已删除'}</p>
                  </div>
                  <div className={cn('mt-1 flex min-h-7 items-center gap-1', mine && 'justify-end')}>
                    {message.deliveryStatus === 'sending' ? (
                      <span className="text-xs text-muted-foreground">发送中…</span>
                    ) : null}
                    {message.deliveryStatus === 'failed' ? (
                      <span className="text-xs text-destructive">{message.errorMessage || '发送失败'}</span>
                    ) : null}
                    {canSend && message.id > 0 ? (
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onReply(message)}>
                        <Reply aria-hidden />
                        回复
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** 格式化聊天消息时间。 */
function formatTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
