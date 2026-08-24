/**
 * 本文件把已持久化的模型流与数据库事件补拉结果转换为 AI SDK UI Message 流。
 */
import 'server-only';

import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type TextStreamPart,
  type UIMessageChunk,
} from 'ai';
import type { AiRunEventPage, AiRunScopeResolutionResponse, AiRunStreamMetadata } from '@workspace/contracts/ai';

import type { AiDecisionUiMessage } from '../types/ai-message';
import type { createDecisionAgentTools } from '../tools/registry';
import { serializeAiThreadScopeChangedError } from '../utils/ai-workspace-state';
import { getAiRunEvents, type AiNestIdentity } from './ai-nest-client.server';

/** Decision Agent 原始模型流片段类型。 */
export type DecisionAgentStreamPart = TextStreamPart<ReturnType<typeof createDecisionAgentTools>>;

/** 为首次执行流写入公开 Run 元数据并保持断开后后台消费。 */
export function createAiExecutionStreamResponse(options: {
  metadata: AiRunStreamMetadata;
  stream: ReadableStream<DecisionAgentStreamPart>;
  onBackgroundStreamEnd: () => Promise<void>;
  onError: (error: unknown) => string;
}): Response {
  const stream = createUIMessageStream<AiDecisionUiMessage>({
    execute: ({ writer }) => {
      writer.write({
        type: 'data-run',
        data: options.metadata,
        transient: true,
      });
      writer.merge(
        toUIMessageStream({
          stream: options.stream,
          onError: options.onError,
        }),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: async ({ stream: backgroundStream }) => {
      try {
        await consumeStream({ stream: backgroundStream });
      } finally {
        await options.onBackgroundStreamEnd();
      }
    },
  });
}

/** 返回合法的 AI SDK 瞬时范围流，让候选等待不会退化成普通 JSON 或空助手消息。 */
export function createAiScopeResolutionStreamResponse(options: {
  metadata: AiRunStreamMetadata;
  scope: AiRunScopeResolutionResponse;
}): Response {
  const stream = createUIMessageStream<AiDecisionUiMessage>({
    execute: ({ writer }) => {
      writer.write({
        type: 'data-run',
        data: options.metadata,
        transient: true,
      });
      writer.write({
        type: 'data-scope',
        data: options.scope,
        transient: true,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}

/**
 * 轮询 NestJS 已持久化事件并生成恢复流。
 * 该函数只读取指定 Run，不领取租约、不创建消息、也不启动 Agent。
 */
export function createAiRecoveryStreamResponse(options: {
  identity: AiNestIdentity;
  threadId: string;
  runId: string;
  afterSequence: number;
  /** 幂等重放首次响应时补发的公开定位元数据；普通 GET 补拉省略。 */
  metadata?: AiRunStreamMetadata;
}): Response {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      if (options.metadata) {
        controller.enqueue({
          type: 'data-run',
          data: options.metadata,
          transient: true,
        });
      }
      void pumpPersistedEvents(controller, options);
    },
  });

  return createUIMessageStreamResponse({ stream });
}

/** 持续补拉事件直到 Run 进入终态或连接被取消。 */
async function pumpPersistedEvents(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  options: {
    identity: AiNestIdentity;
    threadId: string;
    runId: string;
    afterSequence: number;
  },
): Promise<void> {
  let sequence = Math.max(options.afterSequence, 0);
  let textPartId: string | null = null;
  let messageStarted = false;

  try {
    for (;;) {
      const page = await getAiRunEvents(options.identity, options.threadId, options.runId, sequence);
      const previousSequence = sequence;
      ({ sequence, textPartId, messageStarted } = emitPersistedEvents(controller, page, {
        sequence,
        textPartId,
        messageStarted,
      }));

      if (page.hasMore) {
        if (sequence <= previousSequence) {
          throw new Error('AI 运行事件分页游标未推进');
        }
        continue;
      }

      if (isTerminalRunStatus(page.run.status)) {
        if (textPartId) {
          controller.enqueue({ type: 'text-end', id: textPartId });
        }
        controller.enqueue({
          type: 'finish',
          finishReason: page.run.status === 'COMPLETED' ? 'stop' : 'error',
        });
        controller.close();
        return;
      }

      await waitForNextPull();
    }
  } catch (error) {
    controller.enqueue({
      type: 'error',
      errorText:
        serializeAiThreadScopeChangedError(error) ?? (error instanceof Error ? error.message : 'AI 运行恢复失败'),
    });
    controller.close();
  }
}

/** 按数据库顺序把文本事件写入 UI 流，并返回新的游标状态。 */
function emitPersistedEvents(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  page: AiRunEventPage,
  state: { sequence: number; textPartId: string | null; messageStarted: boolean },
): { sequence: number; textPartId: string | null; messageStarted: boolean } {
  let { textPartId, messageStarted } = state;

  for (const event of page.events) {
    if (event.type !== 'ASSISTANT_TEXT_DELTA') {
      continue;
    }

    if (!messageStarted) {
      controller.enqueue({ type: 'start', messageId: event.data.messageId });
      messageStarted = true;
    }
    if (!textPartId) {
      textPartId = `recovery-text-${event.data.messageId}`;
      controller.enqueue({ type: 'text-start', id: textPartId });
    }

    controller.enqueue({
      type: 'text-delta',
      id: textPartId,
      delta: event.data.delta,
    });
  }

  return {
    sequence: page.lastSequence,
    textPartId,
    messageStarted,
  };
}

/** 判断 Run 是否已经进入不可恢复执行的终态。 */
function isTerminalRunStatus(status: AiRunEventPage['run']['status']): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

/** 使用短轮询等待新事件，避免 GET 恢复接口重新启动执行器。 */
function waitForNextPull(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 500));
}
