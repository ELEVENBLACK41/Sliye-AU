/**
 * 本文件封装 Decision AI Chat 的动态 Thread 路由、运行定位、停止和失败重试。
 */
'use client';

import { useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

import type { AiDecisionUiMessage } from '../types/ai-message';

/** 供 AI 对话面板消费的第 2.4 最小交互状态。 */
export function useAiChat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const transport = useMemo(
    () =>
      new DefaultChatTransport<AiDecisionUiMessage>({
        api: '/api/ai/threads',
        prepareSendMessagesRequest: ({ messages, trigger, body }) => {
          const requestBody = body as {
            decisionId?: number;
            clientRequestId?: string;
            retryRunId?: string;
          };

          if (trigger === 'regenerate-message' && requestBody.retryRunId) {
            return {
              api: `/api/ai/runs/${requestBody.retryRunId}/retry`,
              body: { clientRequestId: requestBody.clientRequestId },
            };
          }

          return {
            api: threadId ? `/api/ai/threads/${threadId}/messages` : '/api/ai/threads',
            body: {
              decisionId: requestBody.decisionId,
              clientRequestId: requestBody.clientRequestId,
              messages,
            },
          };
        },
      }),
    [threadId],
  );

  const chat = useChat<AiDecisionUiMessage>({
    transport,
    onData: (part) => {
      if (part.type !== 'data-run') {
        return;
      }

      setThreadId(part.data.threadId);
      setRunId(part.data.runId);
      setCanRetry(false);
    },
    onError: () => setCanRetry(true),
  });

  /** 发送一条绑定指定决策的消息，每次业务操作生成独立幂等键。 */
  const send = async (text: string, decisionId: number): Promise<void> => {
    setCanRetry(false);
    await chat.sendMessage(
      { text },
      {
        body: {
          decisionId,
          clientRequestId: crypto.randomUUID(),
        },
      },
    );
  };

  /** 先请求 NestJS 推进取消状态，再停止当前浏览器流。 */
  const stop = async (): Promise<void> => {
    const currentRunId = runId;

    if (currentRunId) {
      await fetch(`/api/ai/runs/${currentRunId}/stop`, { method: 'POST' });
      setCanRetry(true);
    }

    await chat.stop();
  };

  /** 对最近失败或取消 Run 创建关联的新 Run，不修改旧 Run。 */
  const retry = async (): Promise<void> => {
    const currentRunId = runId;

    if (!currentRunId) {
      return;
    }

    setCanRetry(false);
    await chat.regenerate({
      body: {
        retryRunId: currentRunId,
        clientRequestId: crypto.randomUUID(),
      },
    });
  };

  return {
    ...chat,
    threadId,
    runId,
    canRetry,
    send,
    stop,
    retry,
  };
}
