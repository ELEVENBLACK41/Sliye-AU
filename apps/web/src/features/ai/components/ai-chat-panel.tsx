/**
 * 本文件实现绑定单项决策的真实 Agent 流式对话、工具状态、停止和失败重试界面。
 */
'use client';

import { useState } from 'react';
import { Bot, RefreshCw, Send, Square, UserRound } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';

import { useAiChat } from '../hooks/use-ai-chat';

/** 对话面板可选的预填决策上下文。 */
export type AiChatPanelProps = {
  /** 从决策页面跳转时预填的决策主键。 */
  initialDecisionId?: number;
};

/** 渲染经过权限保护的流式 AI 对话面板。 */
export function AiChatPanel({ initialDecisionId }: AiChatPanelProps) {
  const [input, setInput] = useState('');
  const [decisionIdInput, setDecisionIdInput] = useState(initialDecisionId ? String(initialDecisionId) : '');
  const { messages, status, stop, error, send, retry, threadId, runId, canRetry } = useAiChat();
  const isRunning = status === 'submitted' || status === 'streaming';
  const decisionId = Number(decisionIdInput);
  const hasDecisionId = Number.isInteger(decisionId) && decisionId > 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <Card className="flex min-h-[70vh] flex-1 flex-col rounded-md shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-5 text-primary" aria-hidden />
            决策过程 AI
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            绑定一项真实决策；模型会先调用 NestJS 权限保护的基础上下文工具。
          </p>
          {threadId && runId ? (
            <p className="text-xs text-muted-foreground">
              Thread {threadId.slice(0, 8)} · Run {runId.slice(0, 8)}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex flex-1 flex-col gap-3" aria-live="polite">
            {messages.length ? (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-md bg-primary p-3 text-sm text-primary-foreground'
                      : 'mr-auto max-w-[85%] rounded-md bg-muted p-3 text-sm'
                  }
                >
                  <header className="mb-2 flex items-center gap-1.5 text-xs opacity-75">
                    {message.role === 'user' ? (
                      <UserRound className="size-3.5" aria-hidden />
                    ) : (
                      <Bot className="size-3.5" aria-hidden />
                    )}
                    {message.role === 'user' ? '你' : 'AI'}
                  </header>
                  {message.parts.map((part, index) => {
                    if (part.type === 'text') {
                      return (
                        <p key={`${message.id}-${index}`} className="whitespace-pre-wrap leading-6">
                          {part.text}
                        </p>
                      );
                    }

                    if (part.type === 'tool-getDecisionContext') {
                      const completed = part.state === 'output-available';
                      return (
                        <section
                          key={`${message.id}-${index}`}
                          className="mt-2 rounded-md border bg-background p-3 text-xs"
                        >
                          <p className="font-medium">读取决策基础上下文</p>
                          <p className="mt-1 text-muted-foreground">
                            {completed
                              ? `${part.output.decision.title} · ${part.output.decision.status} · ${part.output.project.title}`
                              : part.state === 'output-error'
                                ? part.errorText
                                : '正在通过 NestJS 校验权限并读取真实数据…'}
                          </p>
                        </section>
                      );
                    }

                    return null;
                  })}
                </article>
              ))
            ) : (
              <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                输入一条消息开始测试受权限保护的流式响应。
              </div>
            )}
          </div>

          <form
            className="grid gap-2 border-t pt-4 sm:grid-cols-[8rem_1fr_auto_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              const message = input.trim();

              if (!message) {
                return;
              }

              if (!hasDecisionId) {
                return;
              }

              void send(message, decisionId);
              setInput('');
            }}
          >
            <Input
              value={decisionIdInput}
              inputMode="numeric"
              aria-label="决策 ID"
              placeholder="决策 ID"
              disabled={isRunning || Boolean(threadId)}
              onChange={(event) => setDecisionIdInput(event.currentTarget.value)}
            />
            <Input
              value={input}
              aria-label="AI 对话消息"
              placeholder="输入消息……"
              disabled={isRunning}
              onChange={(event) => setInput(event.currentTarget.value)}
            />
            {isRunning ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void stop();
                }}
              >
                <Square aria-hidden />
                停止
              </Button>
            ) : null}
            <Button type="submit" disabled={!input.trim() || !hasDecisionId || isRunning}>
              <Send aria-hidden />
              发送
            </Button>
          </form>
          {error || canRetry ? (
            <div
              role={error ? 'alert' : 'status'}
              className={
                error
                  ? 'flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                  : 'flex items-center justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2 text-sm'
              }
            >
              <p>{error ? formatAiChatError(error) : '本次 Run 已停止，可以创建一个关联的新 Run 重试。'}</p>
              {runId && canRetry && !isRunning ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void retry()}>
                  <RefreshCw aria-hidden />
                  重试 Run
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

/** 从 DefaultChatTransport 的错误文本中提取统一 API 中文消息。 */
function formatAiChatError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { message?: unknown };
    return typeof parsed.message === 'string' ? parsed.message : 'AI 对话暂时不可用，请稍后重试';
  } catch {
    return error.message || 'AI 对话暂时不可用，请稍后重试';
  }
}
