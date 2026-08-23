/**
 * 本文件封装 Decision AI Chat 的 Thread 动态路由、持久化恢复、停止和新 Run 重试。
 */
'use client';

import { useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

import type { AiRunPublicSummary } from '@workspace/contracts/ai';

import { requestData } from '@/services/request';

import type { AiDecisionUiMessage } from '../types/ai-message';
import {
  abandonAiRequestForNavigation,
  beginAiRequestSettlementCycle,
  claimAiRequestSettlement,
  createAiPersistenceReceipt,
  createAiRequestSettlementGate,
  finishAiNavigationDisconnect,
  isSameAiRunRequestContext,
  replaceLatestAiUserMessageId,
  selectLatestAiUserMessage,
  type AiPersistenceReceipt,
  type AiRunLocatedMetadata,
  type AiRunRequestContext,
} from '../utils/ai-chat-session';

/** useAiChat 的工作区接入参数。 */
export type UseAiChatOptions = {
  /** 当前 Chat 实例的稳定会话键；显式切换 Thread 时由上层更换。 */
  sessionId: string;
  /** 首次挂载时绑定的 Thread；新会话为空。 */
  initialThreadId: string | null;
  /** 刷新页面时仍处于非终态的 Run。 */
  initialRunId: string | null;
  /** 从数据库恢复的纯文本消息，用于继续提问与重试定位。 */
  initialMessages: AiDecisionUiMessage[];
  /** 首个瞬时元数据到达时同步真实 Thread 路径。 */
  onRunLocated: (metadata: AiRunLocatedMetadata) => void;
  /** 流结束、失败或停止后重新读取对应 Run 的权威历史。 */
  onRunSettled: (context: AiRunRequestContext) => Promise<AiDecisionUiMessage[] | null>;
};

/** 尚未收到持久化确认时复用的发送幂等信息。 */
type PendingSubmission = {
  /** 用户本次提交的规范化正文。 */
  text: string;
  /** 本次消息绑定的决策。 */
  decisionId: number;
  /** 网络结果不明确时必须复用的幂等键。 */
  clientRequestId: string;
};

/** 尚未收到新 Run 定位信息时复用的重试幂等信息。 */
type PendingRetry = {
  /** 被重试的不可变旧 Run。 */
  targetRunId: string;
  /** 网络结果不明确时必须复用的幂等键。 */
  clientRequestId: string;
};

/** 封装工作区需要的实时消息、恢复、停止与重试行为。 */
export function useAiChat({
  sessionId,
  initialThreadId,
  initialRunId,
  initialMessages,
  onRunLocated,
  onRunSettled,
}: UseAiChatOptions) {
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [stopping, setStopping] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [shouldResume] = useState(Boolean(initialThreadId && initialRunId));
  const threadIdRef = useRef<string | null>(initialThreadId);
  const runIdRef = useRef<string | null>(initialRunId);
  const requestContextRef = useRef<AiRunRequestContext | null>(
    initialThreadId && initialRunId ? { sessionId, threadId: initialThreadId, runId: initialRunId } : null,
  );
  const settlementGateRef = useRef(createAiRequestSettlementGate(shouldResume));
  const pendingReceiptRef = useRef<AiPersistenceReceipt | null>(null);
  const pendingSubmissionRef = useRef<PendingSubmission | null>(null);
  const pendingRetryRef = useRef<PendingRetry | null>(null);
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
              api: `/api/ai/runs/${encodeURIComponent(requestBody.retryRunId)}/retry`,
              body: { clientRequestId: requestBody.clientRequestId },
            };
          }

          return {
            api: threadId
              ? `/api/ai/threads/${encodeURIComponent(threadId)}/messages`
              : '/api/ai/threads',
            body: {
              decisionId: requestBody.decisionId,
              clientRequestId: requestBody.clientRequestId,
              messages: selectLatestAiUserMessage(messages),
            },
          };
        },
        prepareReconnectToStreamRequest: () => ({
          api:
            threadId && runId
              ? `/api/ai/threads/${encodeURIComponent(threadId)}/stream?${new URLSearchParams({
                  runId,
                  afterSequence: '0',
                })}`
              : '/api/ai/threads/unavailable/stream',
        }),
      }),
    [runId, threadId],
  );

  /** 让当前请求在错误、成功或用户停止后只刷新一次权威历史。 */
  const settleCurrentRequest = (): void => {
    const requestSequence = claimAiRequestSettlement(settlementGateRef.current);
    const context = requestContextRef.current;
    if (requestSequence === null || !context) {
      return;
    }

    void refreshSettledHistory({
      context,
      requestSequence,
      settlementGate: settlementGateRef.current,
      getCurrentContext: () => requestContextRef.current,
      onRunSettled,
      setMessages: chat.setMessages,
    }).catch(() => undefined);
  };

  /** 收敛 AI SDK 的错误回调，并保留尚未确认保存的输入。 */
  const handleRequestError = (error: Error): void => {
    setStopping(false);
    setRetrying(false);
    pendingReceiptRef.current?.fail(error);
    pendingReceiptRef.current = null;

    if (settlementGateRef.current.navigationDisconnecting) {
      finishAiNavigationDisconnect(settlementGateRef.current);
      return;
    }

    settleCurrentRequest();
  };

  /** 收敛 AI SDK 的最终回调；同一错误在 onError 后不会再次刷新。 */
  const handleRequestFinish = (): void => {
    setStopping(false);
    setRetrying(false);
    pendingReceiptRef.current?.complete(false);
    pendingReceiptRef.current = null;

    if (settlementGateRef.current.navigationDisconnecting) {
      finishAiNavigationDisconnect(settlementGateRef.current);
      return;
    }

    settleCurrentRequest();
  };

  const chat = useChat<AiDecisionUiMessage>({
    id: sessionId,
    messages: initialMessages,
    resume: shouldResume,
    transport,
    onData: (part) => {
      if (part.type !== 'data-run') {
        return;
      }

      const context: AiRunRequestContext = {
        sessionId,
        threadId: part.data.threadId,
        runId: part.data.runId,
      };
      threadIdRef.current = context.threadId;
      runIdRef.current = context.runId;
      requestContextRef.current = context;
      pendingReceiptRef.current?.complete(true);
      pendingReceiptRef.current = null;
      pendingSubmissionRef.current = null;
      pendingRetryRef.current = null;
      chat.setMessages((messages) => replaceLatestAiUserMessageId(messages, part.data.messageId));
      setThreadId(context.threadId);
      setRunId(context.runId);
      onRunLocated({ ...context, messageId: part.data.messageId });
    },
    onFinish: handleRequestFinish,
    onError: handleRequestError,
  });

  /** 发送消息，并只在服务端 `data-run` 确认持久化后返回成功。 */
  const send = (text: string, decisionId: number): Promise<boolean> => {
    setRetrying(false);
    beginAiRequestSettlementCycle(settlementGateRef.current);
    requestContextRef.current = null;
    runIdRef.current = null;
    setRunId(null);

    const pending = pendingSubmissionRef.current;
    const clientRequestId =
      pending?.text === text && pending.decisionId === decisionId
        ? pending.clientRequestId
        : crypto.randomUUID();
    pendingSubmissionRef.current = { text, decisionId, clientRequestId };
    pendingReceiptRef.current?.complete(false);
    const receipt = createAiPersistenceReceipt();
    pendingReceiptRef.current = receipt;

    void chat
      .sendMessage(
        { text },
        {
          body: {
            decisionId,
            clientRequestId,
          },
        },
      )
      .catch((error: unknown) => {
        if (pendingReceiptRef.current !== receipt) return;
        pendingReceiptRef.current = null;
        receipt.fail(toError(error));
      });

    return receipt.promise;
  };

  /** 先推进服务端取消状态，再停止当前浏览器流；后台执行器负责安全收敛。 */
  const stop = async (): Promise<void> => {
    const currentRunId = runIdRef.current;
    if (!currentRunId || stopping) {
      return;
    }

    const hasBrowserStream = chat.status === 'submitted' || chat.status === 'streaming';
    setStopping(true);
    try {
      await requestData<AiRunPublicSummary>(`/api/ai/runs/${encodeURIComponent(currentRunId)}/stop`, {
        method: 'POST',
        errorMessage: '停止 AI 运行失败，请稍后重试',
      });

      if (hasBrowserStream) {
        await chat.stop();
      } else {
        beginAiRequestSettlementCycle(settlementGateRef.current);
        settleCurrentRequest();
      }
    } finally {
      setStopping(false);
    }
  };

  /** 对失败或取消 Run 创建关联新 Run，旧 Run 保持不可变终态。 */
  const retry = async (targetRunId: string, userMessageId: string): Promise<void> => {
    if (retrying) {
      return;
    }

    beginAiRequestSettlementCycle(settlementGateRef.current);
    requestContextRef.current = null;
    runIdRef.current = null;
    setRunId(null);
    setRetrying(true);
    const pending = pendingRetryRef.current;
    const clientRequestId =
      pending?.targetRunId === targetRunId ? pending.clientRequestId : crypto.randomUUID();
    pendingRetryRef.current = { targetRunId, clientRequestId };

    try {
      await chat.regenerate({
        messageId: userMessageId,
        body: {
          retryRunId: targetRunId,
          clientRequestId,
        },
      });
    } catch (error) {
      setRetrying(false);
      throw error;
    }
  };

  /** 仅断开当前浏览器消费，不向服务端发送取消，供 Thread 切换和卸载使用。 */
  const disconnect = async (): Promise<void> => {
    if (chat.status !== 'submitted' && chat.status !== 'streaming') {
      finishAiNavigationDisconnect(settlementGateRef.current);
      return;
    }

    abandonAiRequestForNavigation(settlementGateRef.current);
    pendingReceiptRef.current?.complete(false);
    pendingReceiptRef.current = null;
    await chat.stop();
  };

  return {
    ...chat,
    threadId,
    runId,
    stopping,
    retrying,
    send,
    stop,
    retry,
    disconnect,
  };
}

/** 权威历史非空且仍属于同一请求代次时，才替换当前实时消息副本。 */
async function refreshSettledHistory({
  context,
  requestSequence,
  settlementGate,
  getCurrentContext,
  onRunSettled,
  setMessages,
}: {
  context: AiRunRequestContext;
  requestSequence: number;
  settlementGate: ReturnType<typeof createAiRequestSettlementGate>;
  getCurrentContext: () => AiRunRequestContext | null;
  onRunSettled: (context: AiRunRequestContext) => Promise<AiDecisionUiMessage[] | null>;
  setMessages: (messages: AiDecisionUiMessage[]) => void;
}): Promise<void> {
  const messages = await onRunSettled(context);
  if (
    messages === null ||
    settlementGate.requestSequence !== requestSequence ||
    !isSameAiRunRequestContext(getCurrentContext(), context)
  ) {
    return;
  }

  setMessages(messages);
}

/** 把未知拒绝值收敛为 Error，避免 Promise 永久等待。 */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('AI 对话请求未完成');
}
