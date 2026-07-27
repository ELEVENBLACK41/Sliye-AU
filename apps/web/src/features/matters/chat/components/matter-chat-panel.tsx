/**
 * 本文件组合议事分区消息、历史分页、决策关联和实时状态。
 */
'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { MessageCircleMore, SendHorizontal, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { DiscussionAreaSummary, MatterChatMessagePage, MatterUserSummary } from '@workspace/contracts/matters';

import { MatterChatMessageList } from './matter-chat-message-list';
import { useMatterChat } from '../hooks/use-matter-chat';
import type { MatterChatConnectionStatus } from '../hooks/use-matter-chat-realtime';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Textarea } from '@workspace/ui/components/textarea';

/** 分区聊天面板属性。 */
type MatterChatPanelProps = {
  matterId: number;
  area: DiscussionAreaSummary;
  initialPage: MatterChatMessagePage;
  currentUser: MatterUserSummary;
  canSend: boolean;
  initialDecisionId?: number;
  /** 从会议房间发送消息时写入的来源会议主键，不用于筛选分区消息。 */
  sourceMeetingId?: number;
  readOnlyReason?: string;
};

/** 实时连接状态展示配置。 */
const connectionView: Record<
  MatterChatConnectionStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  unavailable: { label: '实时服务未配置', variant: 'outline' },
  connecting: { label: '连接中', variant: 'secondary' },
  connected: { label: '实时已连接', variant: 'default' },
  reconnecting: { label: '重连中', variant: 'secondary' },
  disconnected: { label: '实时已断开', variant: 'destructive' },
};

/** 渲染一个完整议事分区的聊天体验。 */
export function MatterChatPanel({
  matterId,
  area,
  initialPage,
  currentUser,
  canSend,
  initialDecisionId,
  sourceMeetingId,
  readOnlyReason,
}: MatterChatPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const chat = useMatterChat({
    matterId,
    areaId: area.id,
    initialPage,
    currentUser,
    canSend,
    sourceMeetingId,
    initialDecisionId,
    onAccessRevoked: () => {
      router.replace(`/dashboard/matters/${matterId}`);
      router.refresh();
    },
  });
  const status = connectionView[chat.connectionStatus];

  /** 提交当前草稿并带上可选决策关联。 */
  function submitDraft(): void {
    if (chat.sendMessage(draft)) setDraft('');
  }

  /** 处理表单提交。 */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitDraft();
  }

  /** 处理 Enter 发送与 Shift+Enter 换行。 */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submitDraft();
    }
  }

  return (
    <Card className="overflow-hidden rounded-md py-0 shadow-none">
      <CardHeader className="border-b py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-primary/10 p-2 text-primary">
              <MessageCircleMore aria-hidden />
            </span>
            <div>
              <CardTitle className="text-base">{area.name}</CardTitle>
              <CardDescription className="mt-1">
                {area.type === 'PUBLIC' ? '议事成员共享的公共讨论区' : '只有显式成员可见的私有协作区'}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={area.type === 'PRIVATE' ? 'secondary' : 'outline'}>
              {area.type === 'PRIVATE' ? '私有分区' : '公共分区'}
            </Badge>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[34rem] overflow-y-auto">
          <MatterChatMessageList
            messages={chat.messages}
            currentUserId={currentUser.id}
            canSend={canSend}
            hasMoreHistory={chat.hasMoreHistory}
            isLoadingHistory={chat.isLoadingHistory}
            historyError={chat.historyError}
            onLoadOlder={() => void chat.loadOlderMessages()}
            onReply={chat.setReplyTo}
          />
        </div>
        {canSend ? (
          <form className="space-y-3 border-t p-4" onSubmit={handleSubmit}>
            {chat.replyTo ? (
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                <span className="truncate">回复：{chat.replyTo.content || '该消息已删除'}</span>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="取消回复" onClick={chat.clearReply}>
                  <X aria-hidden />
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={draft}
                maxLength={2000}
                rows={2}
                className="min-h-16 resize-none"
                placeholder="输入分区消息"
                onChange={(event) => setDraft(event.currentTarget.value)}
                onKeyDown={handleKeyDown}
              />
              <Button className="sm:self-end" disabled={!draft.trim()}>
                <SendHorizontal aria-hidden />
                发送
              </Button>
            </div>
          </form>
        ) : (
          <div className="border-t p-4 text-sm text-muted-foreground">{readOnlyReason || '当前分区只读。'}</div>
        )}
      </CardContent>
    </Card>
  );
}
