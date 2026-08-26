/**
 * 本文件提供 AI 工作台的流式对话画布、消息呈现和输入框。
 */
'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { ChatStatus, UIMessage } from 'ai';
import { ChevronDown, Copy, Globe2 } from 'lucide-react';

import { Switch } from '@workspace/ui/components/switch';

import { AiRunActivityLabel, AiToolCallGroup, type AiToolMessagePart } from './ai-tool-call-card';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';

/**
 * 渲染 AI 对话主画布。
 *
 * 2.6-A 会以只读模式保留既有布局；持久化消息与领域 SSE 在 2.6-B 接入。
 */
export function AiChatSurface({ readOnly = false }: { readOnly?: boolean }) {
  const [input, setInput] = useState('');
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const { messages, sendMessage, status, stop, error } = useChat();
  const isRunning = status === 'submitted' || status === 'streaming';

  /** 提交当前输入内容，并交给既有 AI SDK 流式聊天链路处理。 */
  function handleMessageSubmit(message: PromptInputMessage): void {
    const text = message.text.trim();
    if (!text || isRunning || readOnly) return;

    void sendMessage({ text }, { body: { enableWebSearch } });
    setInput('');
  }

  if (messages.length > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        <AiConversation messages={messages} isRunning={isRunning} />
        <div className="mx-auto w-full max-w-3xl pt-4">
          <AiComposer
            input={input}
            status={status}
            isRunning={isRunning}
            enableWebSearch={enableWebSearch}
            onInputChange={setInput}
            onWebSearchChange={setEnableWebSearch}
            onStop={stop}
            onSubmit={handleMessageSubmit}
            readOnly={readOnly}
          />
          <AiChatError error={error} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-12rem)] flex-1 flex-col justify-center px-4 py-8 lg:min-h-0 lg:px-8">
      <div className="mx-auto w-full max-w-3xl -translate-y-8 sm:-translate-y-12">
        <h1 className="mb-7 text-center text-2xl font-semibold tracking-tight text-foreground sm:mb-8 sm:text-3xl">
          今天想推进哪一项决策？
        </h1>
        <AiComposer
          input={input}
          status={status}
          isRunning={isRunning}
          enableWebSearch={enableWebSearch}
          onInputChange={setInput}
          onWebSearchChange={setEnableWebSearch}
          onStop={stop}
          onSubmit={handleMessageSubmit}
          readOnly={readOnly}
        />
        <AiChatError error={error} />
      </div>
    </div>
  );
}

/** 渲染消息流中的用户、AI 文本、运行提示和工具调用卡片。 */
function AiConversation({ messages, isRunning }: { messages: UIMessage[]; isRunning: boolean }) {
  const latestMessage = messages[messages.length - 1];
  const hasLatestAssistantText =
    latestMessage?.role === 'assistant' && latestMessage.parts.some((part) => part.type === 'text' && part.text.trim());
  const hasLatestToolCall =
    latestMessage?.role === 'assistant' && latestMessage.parts.some((part) => part.type.startsWith('tool-'));

  return (
    <Conversation
      className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 py-5"
      aria-live="polite"
    >
      <ConversationContent className="gap-5 px-0 py-0">
        {messages.map((message, index) => (
          <AiConversationMessage
            key={message.id}
            message={message}
            isStreaming={isRunning && index === messages.length - 1}
          />
        ))}
        {isRunning && !hasLatestAssistantText && !hasLatestToolCall ? <AiRunningIndicator /> : null}
      </ConversationContent>
      <ConversationScrollButton aria-label="回到最新消息" />
    </Conversation>
  );
}

/** 按用户或 AI 的不同信息密度，渲染一条聊天消息及其工具轨迹。 */
function AiConversationMessage({ message, isStreaming }: { message: UIMessage; isStreaming: boolean }) {
  const messageText = getMessageText(message);
  const hasAssistantText =
    message.role === 'assistant' && message.parts.some((part) => part.type === 'text' && part.text.trim());
  const toolParts = message.parts.filter((part) => part.type.startsWith('tool-')) as AiToolMessagePart[];
  const webSources = getWebSources(toolParts);

  if (message.role === 'user') {
    return (
      <Message from="user" className="ml-auto w-auto max-w-[85%] gap-0">
        <MessageContent className="rounded-2xl rounded-tr-md bg-decision-accent-soft px-4 py-2.5 text-sm leading-6 text-decision-ink">
          {message.parts.map((part, index) =>
            part.type === 'text' ? (
              <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">
                {part.text}
              </p>
            ) : null,
          )}
        </MessageContent>
        {messageText ? <AiMessageCopyAction text={messageText} label="复制我的消息" /> : null}
      </Message>
    );
  }

  return (
    <Message from="assistant" className="mr-auto w-full max-w-[85%] gap-0">
      <MessageContent className="w-full max-w-full gap-2 overflow-visible text-sm leading-6 text-foreground">
        {toolParts.length > 0 ? <AiToolCallGroup parts={toolParts} /> : null}
        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            return (
              <MessageResponse key={`${message.id}-${index}`} isAnimating={isStreaming}>
                {part.text}
              </MessageResponse>
            );
          }

          return null;
        })}
        {webSources.length > 0 ? <AiWebSources sources={webSources} /> : null}
      </MessageContent>
      {hasAssistantText && messageText ? <AiMessageCopyAction text={messageText} label="复制 AI 回复" /> : null}
    </Message>
  );
}

/** 渲染当前回答实际使用的外部网页来源，保持来源与对应工具结果同一条消息内。 */
function AiWebSources({ sources }: { sources: AiWebSource[] }) {
  return (
    <Sources defaultOpen className="mb-0 pt-1 text-decision-meeting">
      <SourcesTrigger count={sources.length} className="w-fit text-decision-meeting hover:text-decision-meeting/80">
        <Globe2 className="size-3.5" aria-hidden />
        <span>引用了 {sources.length} 个网页来源</span>
        <ChevronDown className="size-3.5" aria-hidden />
      </SourcesTrigger>
      <SourcesContent className="mt-2 flex w-full flex-col gap-1">
        {sources.map((source) => (
          <Source
            key={source.url}
            className="w-fit max-w-full text-decision-meeting hover:text-decision-meeting/80"
            href={source.url}
            title={source.title}
          />
        ))}
      </SourcesContent>
    </Sources>
  );
}

/** 从网页检索工具的真实输出中提取去重后的可点击来源。 */
function getWebSources(parts: AiToolMessagePart[]): AiWebSource[] {
  const sources = new Map<string, AiWebSource>();

  for (const part of parts) {
    if (part.type !== 'tool-parallel_search') continue;

    for (const source of getWebSearchOutputSources(part.output)) {
      sources.set(source.url, source);
    }
  }

  return [...sources.values()];
}

/** 校验并转换网页检索输出，防止工具失败对象或不完整数据被当作来源展示。 */
function getWebSearchOutputSources(output: unknown): AiWebSource[] {
  if (!isWebSearchResult(output)) return [];

  return output.results.flatMap((result) =>
    typeof result.url === 'string' && result.url && typeof result.title === 'string' && result.title
      ? [{ title: result.title, url: result.url }]
      : [],
  );
}

/** 判断未知工具输出是否符合 Parallel 网页检索成功结果的最小结构。 */
function isWebSearchResult(output: unknown): output is { results: Array<{ title?: unknown; url?: unknown }> } {
  return typeof output === 'object' && output !== null && 'results' in output && Array.isArray(output.results);
}

/** 单条外部网页来源在界面上需要的最小安全字段。 */
type AiWebSource = {
  /** 用户可打开的 HTTPS 或 HTTP 网页地址。 */
  url: string;
  /** 搜索服务返回的网页标题。 */
  title: string;
};

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

/** 返回消息内全部文本部分拼接后的可复制内容。 */
function getMessageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('');
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

/** 渲染对话请求失败时的统一错误提示。 */
function AiChatError({ error }: { error: Error | undefined }) {
  if (!error) return null;

  return (
    <p
      role="alert"
      className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {error.message || 'AI 对话暂时不可用，请稍后重试'}
    </p>
  );
}

/** 渲染连接既有流式聊天能力的消息输入框。 */
function AiComposer({
  input,
  status,
  isRunning,
  enableWebSearch,
  onInputChange,
  onWebSearchChange,
  onStop,
  onSubmit,
  readOnly,
}: {
  input: string;
  status: ChatStatus;
  isRunning: boolean;
  enableWebSearch: boolean;
  onInputChange: (value: string) => void;
  onWebSearchChange: (enabled: boolean) => void;
  onStop: () => void;
  onSubmit: (message: PromptInputMessage) => void;
  /** 只读模式不允许继续走临时 `/api/chat` Mock 链路。 */
  readOnly: boolean;
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
        disabled={isRunning || readOnly}
        onChange={(event) => onInputChange(event.currentTarget.value)}
      />
      <PromptInputFooter className="justify-between">
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
          <Globe2 className="size-3.5" aria-hidden />
          <span>联网检索</span>
          <Switch
            aria-label="开启联网检索"
            checked={enableWebSearch}
            disabled={isRunning || readOnly}
            onCheckedChange={onWebSearchChange}
            size="sm"
          />
        </div>
        <PromptInputSubmit
          status={status}
          onStop={onStop}
          className="mb-0.5 rounded-full"
          aria-label={isRunning ? '停止生成' : '发送消息'}
          disabled={readOnly || (!input.trim() && !isRunning)}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
