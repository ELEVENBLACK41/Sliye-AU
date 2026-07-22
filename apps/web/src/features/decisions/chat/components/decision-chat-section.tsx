/**
 * 本文件组合决策群聊的固定高度消息区域、历史滚动加载和文字输入区。
 */
'use client';

import { useEffect, useRef, type UIEvent } from 'react';
import { MessageCircleMore } from 'lucide-react';
import type { DecisionChatMessagePage, DecisionUserSummary } from '@workspace/contracts/decisions';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { DecisionChatComposer } from './decision-chat-composer';
import { DecisionChatMessageList } from './decision-chat-message-list';
import { useDecisionChat } from '../hooks/use-decision-chat';

/** 决策群聊区域属性。 */
type DecisionChatSectionProps = {
  /** 当前决策主键。 */
  decisionId: number;
  /** Server Component 预取的最新消息页。 */
  initialPage: DecisionChatMessagePage;
  /** 当前登录用户公开摘要。 */
  currentUser: DecisionUserSummary;
  /** 当前页面是否允许展示发送能力。 */
  canSend: boolean;
  /** 不可发送时展示的只读原因。 */
  readOnlyReason?: string;
};

/** 渲染嵌入决策详情页的纯 HTTP 群聊区域。 */
export function DecisionChatSection({
  decisionId,
  initialPage,
  currentUser,
  canSend,
  readOnlyReason,
}: DecisionChatSectionProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hasInitialScrollRef = useRef(false);
  const {
    messages,
    hasMoreHistory,
    isLoadingHistory,
    historyError,
    replyTo,
    loadOlderMessages,
    selectReply,
    clearReply,
    sendMessage,
    retryMessage,
  } = useDecisionChat({ decisionId, initialPage, currentUser, canSend });

  /** 首次进入滚动到底部；当前用户新建乐观消息时保持查看最新消息。 */
  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    if (!hasInitialScrollRef.current) {
      viewport.scrollTop = viewport.scrollHeight;
      hasInitialScrollRef.current = true;
      return;
    }

    const latestMessage = messages.at(-1);

    if (latestMessage?.deliveryStatus === 'sending' && latestMessage.author?.id === currentUser.id) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
    }
  }, [currentUser.id, messages]);

  /** 在保持当前可视消息位置的前提下加载更早历史。 */
  async function loadOlderAndPreservePosition(viewport: HTMLDivElement): Promise<void> {
    const previousScrollHeight = viewport.scrollHeight;
    const previousScrollTop = viewport.scrollTop;
    const loaded = await loadOlderMessages();

    if (!loaded) {
      return;
    }

    requestAnimationFrame(() => {
      if (!viewport.isConnected) {
        return;
      }

      viewport.scrollTop = viewport.scrollHeight - previousScrollHeight + previousScrollTop;
    });
  }

  /** 滚动接近顶部时自动触发更早消息分页。 */
  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    if (event.currentTarget.scrollTop > 48) {
      return;
    }

    void loadOlderAndPreservePosition(event.currentTarget);
  }

  /** 处理消息列表顶部按钮触发的历史加载。 */
  function handleLoadOlder(): void {
    const viewport = viewportRef.current;

    if (viewport) {
      void loadOlderAndPreservePosition(viewport);
    }
  }

  return (
    <Card className="overflow-hidden rounded-md py-0 shadow-none">
      <CardHeader className="border-b py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
            <MessageCircleMore className="size-4" aria-hidden />
          </span>
          <div>
            <CardTitle className="text-base">决策群聊</CardTitle>
            <CardDescription className="mt-1">普通讨论会完整保留；决策结束后群聊转为只读。</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div
          ref={viewportRef}
          className="h-[32rem] overflow-y-auto overscroll-contain"
          aria-label="决策群聊消息"
          onScroll={handleScroll}
        >
          <DecisionChatMessageList
            messages={messages}
            currentUserId={currentUser.id}
            canSend={canSend}
            hasMoreHistory={hasMoreHistory}
            isLoadingHistory={isLoadingHistory}
            historyError={historyError}
            onLoadOlder={handleLoadOlder}
            onReply={selectReply}
            onRetry={retryMessage}
          />
        </div>

        <DecisionChatComposer
          canSend={canSend}
          readOnlyReason={readOnlyReason}
          replyTo={replyTo}
          onClearReply={clearReply}
          onSend={sendMessage}
        />
      </CardContent>
    </Card>
  );
}
