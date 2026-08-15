/**
 * 本文件使用新版项目空间视觉展示真实聊天消息、业务关联和历史分页状态。
 */
'use client';

import { FileText, Lightbulb, LoaderCircle, Reply } from 'lucide-react';

import type { ProjectSpaceChatViewMessage } from '../hooks/use-project-space-chat';
import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Button } from '@workspace/ui/components/button';
import { cn } from '@workspace/ui/lib/utils';

/** 新版项目空间消息列表属性。 */
type ProjectSpaceChatMessageListProps = {
  /** 当前分区已经加载并合并实时状态的消息。 */
  messages: ProjectSpaceChatViewMessage[];
  /** 当前认证用户主键。 */
  currentUserId: number;
  /** 当前用户是否可以发送和回复。 */
  canSend: boolean;
  /** 当前分区是否仍有更早历史。 */
  hasMoreHistory: boolean;
  /** 是否正在读取更早历史。 */
  isLoadingHistory: boolean;
  /** 历史分页失败提示。 */
  historyError: string | null;
  /** 请求更早一页消息。 */
  onLoadOlder: () => void;
  /** 选择一条消息作为回复目标。 */
  onReply: (message: ProjectSpaceChatViewMessage) => void;
};

/** 渲染符合新版视觉的消息流，并保留聊天闭环的全部反馈状态。 */
export function ProjectSpaceChatMessageList(props: ProjectSpaceChatMessageListProps) {
  const { messages, currentUserId, canSend, hasMoreHistory, isLoadingHistory, historyError, onLoadOlder, onReply } =
    props;

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex min-h-7 flex-col items-center gap-1.5">
        {hasMoreHistory ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-3 text-[10px] text-black/45 hover:bg-white/55"
            disabled={isLoadingHistory}
            onClick={onLoadOlder}
          >
            {isLoadingHistory ? <LoaderCircle className="size-3 animate-spin" aria-hidden /> : null}
            {isLoadingHistory ? '加载中…' : '加载更早消息'}
          </Button>
        ) : null}
        {historyError ? <p className="text-[10px] text-red-600" role="alert">{historyError}</p> : null}
      </div>

      {messages.length === 0 ? (
        <div className="grid min-h-64 place-items-center text-center">
          <div>
            <p className="text-sm font-medium">当前分区还没有消息</p>
            <p className="mt-1 text-[11px] text-black/40">第一条讨论会完整保存在这里。</p>
          </div>
        </div>
      ) : (
        <ol className="space-y-4" aria-live="polite">
          {messages.map((message) => {
            if (message.type === 'SYSTEM') {
              return <li key={message.id} className="text-center text-[10px] text-black/35">{message.content || '系统消息'}</li>;
            }

            const isMine = message.author?.id === currentUserId;
            const authorName = message.author?.name || `用户 ${message.author?.id ?? '-'}`;
            return (
              <li key={message.id > 0 ? message.id : (message.clientMessageId ?? message.id)}>
                <article className={cn('group flex items-start gap-2.5', isMine && 'flex-row-reverse')}>
                  <Avatar size="sm" className="border border-white/70 shadow-sm shadow-black/[0.03]">
                    <AvatarImage src={message.author?.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className={isMine ? 'bg-[#292a27] text-white' : 'bg-amber-200'}>
                      {authorName.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      'flex w-fit min-w-0 max-w-[78%] flex-col items-start',
                      isMine && 'items-end text-right',
                    )}
                  >
                    <div className={cn('flex items-center gap-2 text-[12px] text-black/60', isMine && 'justify-end')}>
                      <span className="font-medium text-black/65">{authorName}</span>
                      <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                      {message.meetingId ? <span>会议 #{message.meetingId}</span> : null}
                    </div>
                    <div
                      className={cn(
                        'mt-1 w-fit max-w-full rounded-2xl px-3 py-2 text-left text-[14px] leading-5 shadow-sm shadow-black/[0.03]',
                        isMine
                          ? 'rounded-tr-sm bg-[#292a27] text-white'
                          : 'rounded-tl-sm border border-black/[0.045] bg-white/70 text-black/85',
                        message.deliveryStatus === 'failed' && 'ring-1 ring-red-400',
                      )}
                    >
                      {message.replyTo ? (
                        <div className={cn('mb-2 border-l-2 pl-2 text-[12px]', isMine ? 'border-white/35 text-white/65' : 'border-black/15 text-black/45')}>
                          <p>{message.replyTo.author?.name || '原消息'}</p>
                          <p className="line-clamp-2">{message.replyTo.content || '该消息已删除'}</p>
                        </div>
                      ) : null}
                      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {message.content || '该消息已删除'}
                      </p>
                    </div>
                    <div className={cn('mt-1 flex min-h-6 items-center gap-2', isMine && 'justify-end')}>
                      {message.deliveryStatus === 'sending' ? <span className="text-[10px] text-black/35">发送中…</span> : null}
                      {message.deliveryStatus === 'failed' ? <span className="text-[10px] text-red-600">{message.errorMessage || '发送失败'}</span> : null}
                      {canSend && message.id > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 rounded-full px-2 text-[10px] text-black/40 opacity-0 transition-opacity hover:bg-white/55 hover:text-black/65 group-focus-within:opacity-100 group-hover:opacity-100"
                          onClick={() => onReply(message)}
                        >
                          <Reply className="size-3" aria-hidden />回复
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </article>

                {message.decision ? (
                  <article className="mt-2 ml-10 max-w-xl rounded-2xl border border-[#e6bf3c]/45 bg-[#fff8dc]/85 p-3" aria-label="聊天消息关联的决策">
                    <div className="flex items-start gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#f5bf19]">
                        <Lightbulb className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-medium text-[#8a6500]">聊天关联决策</span>
                        <h3 className="mt-1 truncate text-sm font-semibold">{message.decision.title}</h3>
                        <p className="mt-1 flex items-center gap-1 text-[10px] text-black/45">
                          <FileText className="size-3" aria-hidden />决策 #{message.decision.id}
                        </p>
                      </div>
                    </div>
                  </article>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** 将消息 ISO 时间格式化为紧凑中文时间。 */
function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
