/**
 * 本文件实现可恢复的决策过程 AI 对话区，统一首次流与持久化历史的结构化部件。
 */
'use client';

import type { MutableRefObject } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Bot, History, LoaderCircle, Send, Square } from 'lucide-react';

import type {
  AiRunPublicSummary,
  AiThreadDetail,
  AiThreadMessageHistoryItem,
} from '@workspace/contracts/ai';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Skeleton } from '@workspace/ui/components/skeleton';
import { Textarea } from '@workspace/ui/components/textarea';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { ApiClientError } from '@/services/request';

import { useAiChat } from '../hooks/use-ai-chat';
import type { AiDecisionUiMessage } from '../types/ai-message';
import {
  createAiToolCallIdentity,
  type AiRunLocatedMetadata,
  type AiRunRequestContext,
} from '../utils/ai-chat-session';
import { getAiThreadScopeLabel } from '../utils/ai-thread-response';
import { projectAiThreadTimeline, toAiDecisionUiMessages } from '../utils/ai-thread-timeline';
import { AiHistoricalTimelinePart, AiLiveMessageParts } from './ai-chat-timeline-parts';

/** 对话面板属性。 */
export type AiChatPanelProps = {
  /** 显式切换 Thread 时变化的 Chat 实例键。 */
  sessionId: string;
  /** 当前已授权 Thread 详情；新会话为空。 */
  thread: AiThreadDetail | null;
  /** 当前恢复到内存的持久化历史页。 */
  historyItems: AiThreadMessageHistoryItem[];
  /** Thread 消息首屏是否仍在加载。 */
  historyLoading: boolean;
  /** Thread 详情或消息读取错误。 */
  historyError: string | null;
  /** 是否仍有更早的持久化消息。 */
  hasOlderMessages: boolean;
  /** 新会话从业务页面跳转时预填的决策主键。 */
  initialDecisionId?: number;
  /** 移动端打开历史抽屉。 */
  onOpenHistory: () => void;
  /** 首个流元数据到达时同步路由和 Thread 详情。 */
  onRunLocated: (metadata: AiRunLocatedMetadata) => void;
  /** Run 结束后刷新并返回权威消息。 */
  onRunSettled: (context: AiRunRequestContext) => Promise<AiDecisionUiMessage[] | null>;
  /** 加载更早消息。 */
  onLoadOlderMessages: () => void;
  /** 重新加载当前 Thread。 */
  onReloadThread: () => void;
  /** 恢复当前已归档 Thread。 */
  onRestoreThread: () => Promise<boolean>;
  /** 让工作区在显式切换前只断开浏览器消费。 */
  disconnectRef: MutableRefObject<(() => Promise<void>) | null>;
};

/** 渲染含消息时间流、输入区、停止和重试入口的主聊天面板。 */
export function AiChatPanel({
  sessionId,
  thread,
  historyItems,
  historyLoading,
  historyError,
  hasOlderMessages,
  initialDecisionId,
  onOpenHistory,
  onRunLocated,
  onRunSettled,
  onLoadOlderMessages,
  onReloadThread,
  onRestoreThread,
  disconnectRef,
}: AiChatPanelProps) {
  const [input, setInput] = useState('');
  const [decisionIdInput, setDecisionIdInput] = useState(
    initialDecisionId ? String(initialDecisionId) : '',
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const initialMessages = useMemo(() => toAiDecisionUiMessages(historyItems), [historyItems]);
  const timeline = useMemo(() => projectAiThreadTimeline(historyItems), [historyItems]);
  const persistedMessageIds = useMemo(
    () => new Set(historyItems.map((item) => item.message.id)),
    [historyItems],
  );
  const persistedToolCallKeys = useMemo(
    () =>
      new Set(
        historyItems.flatMap((item) =>
          item.runs.flatMap((history) =>
            history.toolCalls.map((toolCall) =>
              createAiToolCallIdentity(history.run.id, toolCall.toolCallId),
            ),
          ),
        ),
      ),
    [historyItems],
  );
  const chat = useAiChat({
    sessionId,
    initialThreadId: thread?.id ?? null,
    initialRunId: thread?.activeRunId ?? null,
    initialMessages,
    onRunLocated,
    onRunSettled,
  });
  const isBrowserStreaming = chat.status === 'submitted' || chat.status === 'streaming';
  const isBusy = isBrowserStreaming || Boolean(thread?.activeRunId);
  const isArchived = Boolean(thread?.archivedAt);
  const decisionId = thread?.decision.id ?? Number(decisionIdInput);
  const hasDecisionId = Number.isInteger(decisionId) && decisionId > 0;

  useEffect(() => {
    disconnectRef.current = chat.disconnect;
    return () => {
      disconnectRef.current = null;
    };
  }, [chat.disconnect, disconnectRef]);

  /** 校验输入后提交消息；失败时保留原输入供用户修正或重试。 */
  const handleSubmit = async (): Promise<void> => {
    const message = input.trim();
    if (!message || !hasDecisionId || isBusy || isArchived) {
      return;
    }

    setActionError(null);
    try {
      const isPersisted = await chat.send(message, decisionId);
      if (isPersisted) {
        setInput('');
      }
    } catch (error) {
      setActionError(formatAiChatError(error));
    }
  };

  /** 请求停止当前 Run，并让权威历史负责最终状态回填。 */
  const handleStop = async (): Promise<void> => {
    setActionError(null);
    try {
      await chat.stop();
    } catch (error) {
      setActionError(formatAiChatError(error));
    }
  };

  /** 对当前最后一个可重试 Run 创建关联新 Run。 */
  const handleRetry = async (run: AiRunPublicSummary): Promise<void> => {
    setActionError(null);
    try {
      await chat.retry(run.id, run.userMessageId);
    } catch (error) {
      setActionError(formatAiChatError(error));
    }
  };

  return (
    <section className="flex size-full min-h-0 min-w-0 flex-col overflow-hidden bg-background" aria-label="AI 对话工作区">
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5 sm:px-4">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="lg:hidden"
          aria-label="打开 AI 会话历史"
          onClick={onOpenHistory}
        >
          <History aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate font-semibold">{thread?.title ?? '新建决策过程会话'}</h2>
            {isArchived ? <Badge variant="secondary">已归档</Badge> : null}
            {isBusy ? (
              <Badge variant="outline" className="gap-1">
                <LoaderCircle aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
                {chat.stopping ? '正在停止' : '运行中'}
              </Badge>
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {thread
              ? getAiThreadScopeLabel(thread)
              : '发送首条消息时才会创建 Thread，不保存空白草稿'}
          </p>
        </div>
        {isArchived ? (
          <Button type="button" size="sm" variant="outline" onClick={() => void onRestoreThread()}>
            <ArchiveRestore aria-hidden />
            恢复后继续
          </Button>
        ) : null}
      </header>

      <Conversation>
        <ConversationContent>
          {hasOlderMessages ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mx-auto"
              disabled={historyLoading}
              onClick={onLoadOlderMessages}
            >
              {historyLoading ? (
                <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
              ) : null}
              {historyLoading ? '正在加载' : '加载更早消息'}
            </Button>
          ) : null}

          {historyLoading && historyItems.length === 0 ? <AiMessageHistorySkeleton /> : null}

          {historyError && historyItems.length === 0 ? (
            <Alert variant="destructive">
              <AlertTitle>当前会话无法加载</AlertTitle>
              <AlertDescription>
                <p>{historyError}</p>
                <Button type="button" size="sm" variant="outline" onClick={onReloadThread}>
                  重新加载
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {!historyLoading && !historyError && timeline.length === 0 && chat.messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Bot aria-hidden className="size-7" />}
              title="开始记录一段决策分析"
              description="可以询问当前决策的背景、状态或形成过程；离题问题会被简短拒绝。"
            />
          ) : null}

          {timeline.map((item) => (
            <AiHistoricalTimelinePart
              key={item.id}
              item={item}
              thread={thread}
              retrying={chat.retrying}
              onRetry={handleRetry}
            />
          ))}

          {chat.messages
            .filter((message) => !persistedMessageIds.has(message.id))
            .map((message) => (
              <AiLiveMessageParts
                key={message.id}
                message={message}
                streaming={isBrowserStreaming}
                runId={chat.runId}
                thread={thread}
                fallbackDecisionId={hasDecisionId ? decisionId : 0}
                persistedToolCallKeys={persistedToolCallKeys}
              />
            ))}

          {historyError && historyItems.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>部分历史刷新失败</AlertTitle>
              <AlertDescription>{historyError}</AlertDescription>
            </Alert>
          ) : null}

          {chat.error || actionError ? (
            <Alert variant="destructive">
              <AlertTitle>本次操作未完成</AlertTitle>
              <AlertDescription>{actionError ?? formatAiChatError(chat.error)}</AlertDescription>
            </Alert>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <footer className="shrink-0 border-t bg-card p-3 sm:p-4">
        {isArchived ? (
          <p className="mb-2 text-xs text-muted-foreground">当前会话已归档，恢复后才能继续提问。</p>
        ) : null}
        <form
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid min-w-0 gap-2">
            {!thread ? (
              <Input
                value={decisionIdInput}
                inputMode="numeric"
                aria-label="决策 ID"
                placeholder="输入要分析的决策 ID"
                disabled={isBusy}
                onChange={(event) => setDecisionIdInput(event.currentTarget.value)}
              />
            ) : null}
            <Textarea
              value={input}
              aria-label="AI 对话消息"
              placeholder="询问这项决策是如何形成的……"
              className="max-h-40 min-h-16 resize-none overflow-y-auto"
              disabled={isBusy || isArchived || Boolean(historyError && !thread)}
              onChange={(event) => setInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>
          <div className="flex items-end gap-2 sm:flex-col sm:justify-end">
            {isBusy ? (
              <Button
                type="button"
                variant="outline"
                disabled={chat.stopping || !chat.runId}
                onClick={() => void handleStop()}
              >
                {chat.stopping ? (
                  <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
                ) : (
                  <Square aria-hidden />
                )}
                {chat.stopping ? '正在停止' : '停止'}
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={!input.trim() || !hasDecisionId || isBusy || isArchived || historyLoading}
            >
              <Send aria-hidden />
              发送
            </Button>
          </div>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Ctrl/⌘ + Enter 发送；AI 只回答当前 Thread 绑定决策的形成过程。</p>
      </footer>
    </section>
  );
}

/** 渲染独立于左侧历史导航的消息首屏骨架。 */
function AiMessageHistorySkeleton() {
  return (
    <div className="space-y-5" aria-label="正在加载 AI 会话消息" role="status">
      <div className="ml-auto w-2/3 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div className="w-4/5 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

/** 从统一 BFF 错误正文提取安全中文信息，未知异常使用固定兜底。 */
function formatAiChatError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message.trim() || 'AI 对话暂时不可用，请稍后重试';
  }

  if (!(error instanceof Error)) {
    return 'AI 对话暂时不可用，请稍后重试';
  }

  try {
    const parsed = JSON.parse(error.message) as { message?: unknown };
    return typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message
      : 'AI 对话暂时不可用，请稍后重试';
  } catch {
    return 'AI 对话暂时不可用，请稍后重试';
  }
}
