/**
 * 本文件实现 AI SDK 流式对话界面，接口失败时由受保护的 `/api/chat` 返回统一错误。
 */
'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Bot, Send, UserRound } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';

/** 渲染经过权限保护的流式 AI 对话面板。 */
export function AiChatPanel() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <Card className="flex min-h-[70vh] flex-1 flex-col rounded-md shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="size-5 text-emerald-700" aria-hidden />
            AI 对话测试
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            页面和流式接口都会验证 ai:chat:use，前端隐藏不能替代后端授权。
          </p>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex flex-1 flex-col gap-3" aria-live="polite">
            {messages.length ? (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-md bg-emerald-700 p-3 text-sm text-white'
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

                    if (part.type === 'tool-weather' || part.type === 'tool-convertFahrenheitToCelsius') {
                      return (
                        <pre key={`${message.id}-${index}`} className="mt-2 overflow-x-auto text-xs">
                          {JSON.stringify(part, null, 2)}
                        </pre>
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
            className="flex gap-2 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              const message = input.trim();

              if (!message) {
                return;
              }

              void sendMessage({ text: message });
              setInput('');
            }}
          >
            <Input
              value={input}
              aria-label="AI 对话消息"
              placeholder="输入消息……"
              onChange={(event) => setInput(event.currentTarget.value)}
            />
            <Button type="submit" disabled={!input.trim()}>
              <Send aria-hidden />
              发送
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
