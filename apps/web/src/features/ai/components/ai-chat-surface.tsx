/**
 * 本文件提供 AI 工作台的流式对话画布、消息呈现和输入框。
 */
'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { ArrowUp, Copy, Square } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';

import { AiRunActivityLabel, AiToolCallGroup, type AiToolMessagePart } from './ai-tool-call-card';
import { MessageResponse } from '@/components/ai-elements/message';

/** 渲染复用既有 `/api/chat` 流式测试机器人的 AI 对话主画布。 */
export function AiChatSurface({ userName }: { userName: string }) {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop, error } = useChat();
  const isRunning = status === 'submitted' || status === 'streaming';

  /** 提交当前输入内容，并交给既有 AI SDK 流式聊天链路处理。 */
  function handleMessageSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = input.trim();
    if (!text || isRunning) return;

    void sendMessage({ text });
    setInput('');
  }

  if (messages.length > 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 lg:px-8">
        <AiConversation messages={messages} isRunning={isRunning} />
        <div className="mx-auto w-full max-w-3xl pt-4">
          <AiComposer
            input={input}
            isRunning={isRunning}
            onInputChange={setInput}
            onStop={stop}
            onSubmit={handleMessageSubmit}
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
          {userName}，今天想推进哪一项决策？
        </h1>
        <AiComposer
          input={input}
          isRunning={isRunning}
          onInputChange={setInput}
          onStop={stop}
          onSubmit={handleMessageSubmit}
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
    <div
      className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto py-5"
      aria-live="polite"
    >
      {messages.map((message, index) => (
        <AiConversationMessage
          key={message.id}
          message={message}
          isStreaming={isRunning && index === messages.length - 1}
        />
      ))}
      {isRunning && !hasLatestAssistantText && !hasLatestToolCall ? <AiRunningIndicator /> : null}
    </div>
  );
}

/** 按用户或 AI 的不同信息密度，渲染一条聊天消息及其工具轨迹。 */
function AiConversationMessage({ message, isStreaming }: { message: UIMessage; isStreaming: boolean }) {
  const hasAssistantText =
    message.role === 'assistant' && message.parts.some((part) => part.type === 'text' && part.text.trim());
  const toolParts = message.parts.filter((part) => part.type.startsWith('tool-')) as AiToolMessagePart[];

  if (message.role === 'user') {
    return (
      <article className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-decision-accent-soft px-4 py-2.5 text-sm leading-6 text-decision-ink">
        {message.parts.map((part, index) =>
          part.type === 'text' ? (
            <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">
              {part.text}
            </p>
          ) : null,
        )}
      </article>
    );
  }

  return (
    <article className="mr-auto w-full max-w-[85%] space-y-2 text-sm leading-6 text-foreground">
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
      {hasAssistantText ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label="复制 AI 回复"
        >
          <Copy aria-hidden />
        </Button>
      ) : null}
    </article>
  );
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
  isRunning,
  onInputChange,
  onStop,
  onSubmit,
}: {
  input: string;
  isRunning: boolean;
  onInputChange: (value: string) => void;
  onStop: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="flex items-end gap-2 rounded-[1.35rem] border border-border bg-background p-2 shadow-sm"
      aria-label="发送 AI 消息"
      onSubmit={onSubmit}
    >
      <Textarea
        aria-label="向 Decision AI 提问"
        placeholder="描述你正在推进的决策，或粘贴一段讨论内容…"
        className="min-h-12 resize-none border-0 px-3 py-2 shadow-none focus-visible:ring-0"
        value={input}
        disabled={isRunning}
        onChange={(event) => onInputChange(event.currentTarget.value)}
      />
      {isRunning ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="mb-0.5 rounded-full"
          aria-label="停止生成"
          onClick={onStop}
        >
          <Square aria-hidden />
        </Button>
      ) : (
        <Button
          type="submit"
          size="icon-sm"
          className="mb-0.5 rounded-full"
          aria-label="发送消息"
          disabled={!input.trim()}
        >
          <ArrowUp aria-hidden />
        </Button>
      )}
    </form>
  );
}
