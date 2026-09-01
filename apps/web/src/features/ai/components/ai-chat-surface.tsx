/**
 * 本文件提供 AI 工作台的持久化对话画布、消息呈现和输入框视觉层。
 */
'use client';

import { useState, type ReactNode } from 'react';
import type { ChatStatus } from 'ai';
import { Button } from '@workspace/ui/components/button';
import { Copy, Globe2 } from 'lucide-react';

import type { AiMessageSubmissionMode, AiRunStatus } from '@workspace/contracts/ai';

import { Switch } from '@workspace/ui/components/switch';

import { AiCitationList } from './ai-citation-list';
import { AiQueuedMessages } from './ai-queued-messages';
import { AiRunActivityLabel, AiToolCallGroup, type AiToolMessagePart } from './ai-tool-call-card';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import type { AiWorkspaceMessage } from '../types/ai-message';
import type { AiWorkspaceCommandState, AiWorkspaceQueuedMessage, AiWorkspaceStreamState } from '../types/ai-workspace';
import { isAiRunActive } from '../utils/ai-event-reducer';

/** 流式回答按字符淡入，保持模型小片段到达时的连续视觉反馈。 */
const STREAMING_MESSAGE_ANIMATION = {
  // animation: 'fadeIn',
  // sep: 'char',
  duration: 200,         // milliseconds (default: 150)
  easing: "ease-out",    // CSS timing function (default: "ease")
  sep: "word",
} as const;

/**
 * 渲染 AI 对话主画布。
 *
 * 2.6-C 通过 Thread Hook 提交真实消息，并把排队/停止/重试状态投影到既有视觉层。
 */
export function AiChatSurface({
  messages,
  activeRunStatus,
  streamState,
  streamError,
  queuedMessages,
  commandState,
  commandError,
  onSubmitMessage,
  onStop,
  onRetry,
}: {
  /** 已按服务端时间顺序适配好的历史与实时消息。 */
  messages: AiWorkspaceMessage[];
  /** 当前详情或事件快照中的 Run 状态。 */
  activeRunStatus: AiRunStatus | null;
  /** 标准领域 SSE 当前连接状态。 */
  streamState: AiWorkspaceStreamState;
  /** 标准领域 SSE 明确返回的错误。 */
  streamError: string | null;
  /** 已由服务端确认但还未领取的用户输入。 */
  queuedMessages: AiWorkspaceQueuedMessage[];
  /** 当前浏览器命令请求的生命周期。 */
  commandState: AiWorkspaceCommandState;
  /** 当前发送、停止或重试命令的错误。 */
  commandError: string | null;
  /** 提交用户消息，可显式选择普通发送或调整方向。 */
  onSubmitMessage: (message: string, submissionMode?: AiMessageSubmissionMode) => Promise<boolean>;
  /** 请求停止当前 Run。 */
  onStop: () => void;
  /** 重试一条已失败或已取消的 Run。 */
  onRetry: (runId: string) => void;
}) {
  const [input, setInput] = useState('');
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [editingQueuedMessageId, setEditingQueuedMessageId] = useState<string | null>(null);
  const isRunning = isAiRunActive(activeRunStatus);
  const isCommandPending = commandState !== 'IDLE';

  /** 提交输入框内容；编辑排队项时使用 STEER 替代原消息。 */
  async function handleMessageSubmit(message: PromptInputMessage): Promise<void> {
    const text = message.text.trim();
    if (!text || isCommandPending) return;

    const submissionMode = editingQueuedMessageId ? 'STEER' : 'NORMAL';
    const submitted = await onSubmitMessage(text, submissionMode);
    if (!submitted) return;

    setInput('');
    setEditingQueuedMessageId(null);
  }

  /** 把排队消息复制到输入框，提交时由服务端按调整方向处理。 */
  function handleQueuedMessageEdit(message: AiWorkspaceQueuedMessage): void {
    setInput(message.content);
    setEditingQueuedMessageId(message.id);
  }

  /** 对排队消息使用原文发起一次真实的调整方向提交。 */
  function handleQueuedMessageSteer(message: AiWorkspaceQueuedMessage): void {
    void onSubmitMessage(message.content, 'STEER');
  }

  /** 渲染固定在对话底部的消息输入区域，队列卡片与输入框处于同一文档流。 */
  function renderComposer(): ReactNode {
    return (
      <div className="relative z-10 mx-auto w-full max-w-3xl pt-4">
        <AiQueuedMessages
          messages={queuedMessages}
          onSteer={handleQueuedMessageSteer}
          onEdit={handleQueuedMessageEdit}
        />
        <AiComposer
          input={input}
          status={toComposerStatus(activeRunStatus, commandState)}
          isRunning={isRunning}
          isCommandPending={isCommandPending}
          enableWebSearch={enableWebSearch}
          onInputChange={setInput}
          onWebSearchChange={setEnableWebSearch}
          onStop={onStop}
          onSubmit={handleMessageSubmit}
        />
        {editingQueuedMessageId ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setEditingQueuedMessageId(null)}
          >
            取消编辑
          </Button>
        ) : null}
        <AiChatError error={commandError ?? streamError} streamState={streamState} />
      </div>
    );
  }

  if (messages.length > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        <AiConversation messages={messages} isRunning={isRunning} onRetry={onRetry} />
        {renderComposer()}
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-1 flex-col justify-center px-4 py-8 lg:min-h-0 lg:px-8">
      <div className="mx-auto w-full max-w-3xl -translate-y-8 sm:-translate-y-12">
        <h1 className="mb-7 text-center text-2xl font-semibold tracking-tight text-foreground sm:mb-8 sm:text-3xl">
          今天想推进哪一项决策？
        </h1>
        {renderComposer()}
      </div>
    </div>
  );
}

/** 将服务端 Run 状态与浏览器命令状态转换为 PromptInput 的视觉状态。 */
function toComposerStatus(activeRunStatus: AiRunStatus | null, commandState: AiWorkspaceCommandState): ChatStatus {
  if (commandState !== 'IDLE') return 'submitted';
  if (activeRunStatus === 'CANCELLATION_REQUESTED') return 'submitted';
  return isAiRunActive(activeRunStatus) ? 'streaming' : 'ready';
}

/** 渲染持久化消息、实时助手文本、运行提示和工具调用卡片。 */
function AiConversation({
  messages,
  isRunning,
  onRetry,
}: {
  messages: AiWorkspaceMessage[];
  isRunning: boolean;
  onRetry: (runId: string) => void;
}) {
  const latestMessage = messages[messages.length - 1];
  const hasLatestAssistantText = latestMessage?.role === 'assistant' && latestMessage.content.trim().length > 0;
  const hasLatestToolCall = latestMessage?.role === 'assistant' && (latestMessage.run?.toolCalls.length ?? 0) > 0;

  return (
    <Conversation className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 py-5" aria-live="polite">
      <ConversationContent className="gap-5 px-0 py-0">
        {messages.map((message, index) => (
          <AiConversationMessage
            key={message.id}
            message={message}
            isStreaming={
              message.isStreaming || (isRunning && index === messages.length - 1 && message.role === 'assistant')
            }
            onRetry={onRetry}
          />
        ))}
        {isRunning && !hasLatestAssistantText && !hasLatestToolCall ? <AiRunningIndicator /> : null}
      </ConversationContent>
      <ConversationScrollButton aria-label="回到最新消息" />
    </Conversation>
  );
}

/** 按用户或 AI 的不同信息密度，渲染一条持久化消息及其工具轨迹。 */
function AiConversationMessage({
  message,
  isStreaming,
  onRetry,
}: {
  message: AiWorkspaceMessage;
  isStreaming: boolean;
  onRetry: (runId: string) => void;
}) {
  const messageText = message.content;
  const hasAssistantText = message.role === 'assistant' && message.content.trim().length > 0;
  const toolParts = toAiToolMessageParts(message);

  if (message.role === 'user') {
    return (
      <Message from="user" className="ml-auto w-auto max-w-[85%] gap-0">
        <MessageContent className="rounded-2xl rounded-tr-md bg-decision-accent-soft px-4 py-2.5 text-sm leading-6 text-decision-ink">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </MessageContent>
        {message.dispatchState === 'SUPERSEDED' ? (
          <p className="text-xs text-muted-foreground">这条输入已被新的调整方向替代。</p>
        ) : null}
        {messageText ? <AiMessageCopyAction text={messageText} label="复制我的消息" /> : null}
      </Message>
    );
  }

  return (
    <Message from="assistant" className="mr-auto w-full max-w-[85%] gap-0">
      <MessageContent className="w-full max-w-full gap-2 overflow-visible text-sm leading-6 text-foreground">
        {message.contentVisibility === 'SOURCE_REVOKED' ? (
          <p className="text-sm text-muted-foreground">这条回答当前无法显示。</p>
        ) : (
          <>
            {toolParts.length > 0 ? <AiToolCallGroup parts={toolParts} /> : null}
            {message.content ? (
              <MessageResponse 
              animated={STREAMING_MESSAGE_ANIMATION} 
              // animated={{ animation: "slideUp" }}
              isAnimating={isStreaming}
              >
                {message.content}
              </MessageResponse>
            ) : null}
            {/*引用显示组件*/}

            {hasAssistantText ? <AiCitationList /> : null}  
          </>
        )}
        <AiRunStatusNotice status={message.run?.status ?? null} runId={message.run?.runId ?? null} onRetry={onRetry} />
      </MessageContent>
      {hasAssistantText && message.contentVisibility === 'VISIBLE' && messageText ? (
        <AiMessageCopyAction text={messageText} label="复制 AI 回复" />
      ) : null}
    </Message>
  );
}

/** 将历史 Run 工具摘要转换为既有工具卡需要的最小 AI SDK 风格结构。 */
function toAiToolMessageParts(message: AiWorkspaceMessage): AiToolMessagePart[] {
  if (message.role !== 'assistant' || message.contentVisibility === 'SOURCE_REVOKED' || !message.run) {
    return [];
  }

  return message.run.toolCalls.map((toolCall) => ({
    type: `tool-${toolCall.toolName}`,
    toolCallId: toolCall.id,
    state:
      toolCall.status === 'SUCCEEDED'
        ? 'output-available'
        : toolCall.status === 'FAILED'
          ? 'output-error'
          : 'input-available',
    errorText: toolCall.failureReason ?? undefined,
  }));
}

/** 渲染失败、取消和取消中的回答状态，避免它们被误显示为完成。 */
function AiRunStatusNotice({
  status,
  runId,
  onRetry,
}: {
  status: AiRunStatus | null;
  runId: string | null;
  onRetry: (runId: string) => void;
}) {
  const notice =
    status === 'FAILED'
      ? '本次回答生成失败。'
      : status === 'CANCELLED'
        ? '本次回答已取消。'
        : status === 'CANCELLATION_REQUESTED'
          ? '正在停止本次回答…'
          : status === 'QUEUED'
            ? '回答排队中…'
            : status === 'WAITING_APPROVAL'
              ? '回答正在等待确认。'
              : null;

  if (!notice) return null;

  const canRetry = (status === 'FAILED' || status === 'CANCELLED') && runId !== null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <p>{notice}</p>
      {canRetry ? (
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onRetry(runId)}>
          重试
        </Button>
      ) : null}
    </div>
  );
}

/** 渲染单条消息下方的复制操作，并调用兼容 HTTPS 与本地开发环境的复制逻辑。 */
function AiMessageCopyAction({ text, label }: { text: string; label: string }) {
  return (
    <MessageActions>
      <MessageAction
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label={label}
        label={label}
        onClick={() => copyMessageText(text)}
      >
        <Copy aria-hidden />
      </MessageAction>
    </MessageActions>
  );
}

/** 优先通过浏览器 Clipboard API 复制内容，权限受限时回退到传统选择复制。 */
function copyMessageText(text: string): void {
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => copyMessageTextFallback(text));
    return;
  }

  copyMessageTextFallback(text);
}

/** 为不支持 Clipboard API 的本地环境提供兼容复制方案。 */
function copyMessageTextFallback(text: string): void {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.opacity = '0';
  textarea.style.position = 'fixed';
  textarea.style.pointerEvents = 'none';
  document.body.append(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

/** 渲染尚未开始工具调用时的统一运行提示。 */
function AiRunningIndicator() {
  return (
    <div className="mr-auto py-1" aria-live="polite">
      <AiRunActivityLabel label="正在运行" isRunning />
    </div>
  );
}

/** 渲染领域 SSE 的明确错误或断线重连状态。 */
function AiChatError({ error, streamState }: { error: string | null; streamState: AiWorkspaceStreamState }) {
  const message =
    error ??
    (streamState === 'RECONNECTING'
      ? '实时回答连接已断开，正在重连…'
      : streamState === 'CONNECTING'
        ? '正在连接实时回答…'
        : null);

  if (!message) return null;

  return (
    <p
      role={error ? 'alert' : undefined}
      aria-live="polite"
      className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

/** 渲染连接既有流式聊天能力的消息输入框。 */
function AiComposer({
  input,
  status,
  isRunning,
  isCommandPending,
  enableWebSearch,
  onInputChange,
  onWebSearchChange,
  onStop,
  onSubmit,
}: {
  input: string;
  status: ChatStatus;
  isRunning: boolean;
  isCommandPending: boolean;
  enableWebSearch: boolean;
  onInputChange: (value: string) => void;
  onWebSearchChange: (enabled: boolean) => void;
  onStop: () => void;
  onSubmit: (message: PromptInputMessage) => void | Promise<void>;
}) {
  return (
    <PromptInput
      className="flex items-end gap-2 rounded-[1.35rem] border border-border bg-background p-2 shadow-sm"
      aria-label="发送 AI 消息"
      onSubmit={onSubmit}
    >
      <PromptInputTextarea
        aria-label="向 Decision AI 提问"
        placeholder="描述你正在推进的决策，或粘贴一段讨论内容…"
        className="min-h-12 resize-none border-0 px-3 py-2 shadow-none focus-visible:ring-0"
        value={input}
        disabled={isCommandPending}
        onChange={(event) => onInputChange(event.currentTarget.value)}
      />
      <PromptInputFooter className="justify-between">
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
          <Globe2 className="size-3.5" aria-hidden />
          <span>联网检索（暂未接入）</span>
          <Switch
            aria-label="开启联网检索"
            checked={enableWebSearch}
            disabled
            onCheckedChange={onWebSearchChange}
            size="sm"
          />
        </div>
        <PromptInputSubmit
          status={status}
          onStop={onStop}
          className="mb-0.5 rounded-full"
          aria-label={isRunning ? '停止生成' : '发送消息'}
          disabled={isCommandPending || (!input.trim() && !isRunning)}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
