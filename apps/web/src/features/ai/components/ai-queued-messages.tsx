/**
 * 本文件渲染活跃 Run 期间已经被服务端确认、但尚未领取的用户输入。
 * 队列卡片独立于 PromptInput，避免 InputGroup 的 overflow 规则把它裁掉。
 */
'use client';

import { Ellipsis, Pencil, Route, Trash2 } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';

import type { AiWorkspaceQueuedMessage } from '../types/ai-workspace';

/** 渲染排队消息列表及当前服务端允许的调整方向操作。 */
export function AiQueuedMessages({
  messages,
  onSteer,
  onEdit,
}: {
  /** 按服务端队列序号排序的排队消息。 */
  messages: AiWorkspaceQueuedMessage[];
  /** 以原文提交一次 STEER，替代旧排队输入并请求取消当前 Run。 */
  onSteer: (message: AiWorkspaceQueuedMessage) => void;
  /** 把消息放入输入框，后续提交时以 STEER 方式替代原排队输入。 */
  onEdit: (message: AiWorkspaceQueuedMessage) => void;
}) {
  if (messages.length === 0) return null;

  return (
    <section className="relative z-20 mb-2 space-y-2" aria-label="排队中的消息">
      {messages.map((message) => (
        <article
          key={message.id}
          className="rounded-[1.1rem] border border-border bg-card px-3 py-2 shadow-sm"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex shrink-0 items-center gap-1 pt-1 text-xs text-muted-foreground"
              aria-label={`队列位置 ${message.queueSequence}`}
            >
              <Route className="size-3.5" aria-hidden />
              {message.queueSequence}
            </span>
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
              {message.content}
            </p>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg px-2 text-xs"
                onClick={() => onSteer(message)}
                disabled={message.isSteering}
              >
                <Route aria-hidden />
                调整方向
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label="删除排队消息（暂未开放）"
                disabled
              >
                <Trash2 aria-hidden />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="排队消息更多操作">
                    <Ellipsis aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6}>
                  <DropdownMenuItem onSelect={() => onEdit(message)}>
                    <Pencil aria-hidden />
                    编辑并替代
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onSteer(message)} disabled={message.isSteering}>
                    <Route aria-hidden />
                    调整方向
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled>
                    <Trash2 aria-hidden />
                    删除（暂未开放）
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <p className="mt-1 pl-7 text-xs text-muted-foreground">
            {message.isSteering ? '正在停止当前回答，随后按新方向继续' : '排队中，当前回答结束后按顺序处理'}
          </p>
        </article>
      ))}
    </section>
  );
}
