/**
 * 本文件把数据库消息、Run、工具和来源投影为可确定排序、可去重的工作区时间流。
 */

import type {
  AiMessage,
  AiRunPublicSummary,
  AiThreadMessageHistoryItem,
} from '@workspace/contracts/ai';

import type { AiDecisionUiMessage } from '../types/ai-message';

import {
  toHistoricalAiToolCallView,
  type AiToolCallView,
} from './ai-tool-call-view';

/** 历史工作区统一消费的结构化时间流部件。 */
export type AiThreadTimelineItem =
  | {
      /** 用户或助手正文。 */
      kind: 'message';
      /** 稳定消息主键。 */
      id: string;
      /** 持久化消息。 */
      message: AiMessage;
      /** ISO 时间用于确定性排序。 */
      createdAt: string;
    }
  | {
      /** 一次结构化工具调用。 */
      kind: 'tool';
      /** 工具调用 ID。 */
      id: string;
      /** 所属 Run 主键。 */
      runId: string;
      /** 安全工具卡数据。 */
      tool: AiToolCallView;
      /** ISO 时间用于确定性排序。 */
      createdAt: string;
    }
  | {
      /** 一组后端允许的稳定来源。 */
      kind: 'citations';
      /** Run 内稳定引用部件标识。 */
      id: string;
      /** 所属 Run 主键。 */
      runId: string;
      /** 去重后的来源 ID。 */
      sourceIds: string[];
      /** ISO 时间用于确定性排序。 */
      createdAt: string;
    }
  | {
      /** Run 的真实状态反馈。 */
      kind: 'run';
      /** Run 主键。 */
      id: string;
      /** 不含执行租约的公开状态摘要。 */
      run: AiRunPublicSummary;
      /** ISO 时间用于确定性排序。 */
      createdAt: string;
    };

/** 将一组历史页条目投影为去重且确定排序的结构化时间流。 */
export function projectAiThreadTimeline(items: AiThreadMessageHistoryItem[]): AiThreadTimelineItem[] {
  const projected = new Map<string, AiThreadTimelineItem>();

  for (const item of items) {
    const messageKey = `message:${item.message.id}`;
    projected.set(messageKey, {
      kind: 'message',
      id: messageKey,
      message: item.message,
      createdAt: item.message.createdAt,
    });

    for (const history of item.runs) {
      const { run, sourceIds, toolCalls } = history;

      for (const toolCall of toolCalls) {
        const toolKey = `tool:${run.id}:${toolCall.toolCallId}`;
        projected.set(toolKey, {
          kind: 'tool',
          id: toolKey,
          runId: run.id,
          tool: toHistoricalAiToolCallView(toolCall, run),
          createdAt: toolCall.startedAt ?? toolCall.createdAt,
        });
      }

      if (sourceIds.length > 0) {
        const citationKey = `citations:${run.id}`;
        projected.set(citationKey, {
          kind: 'citations',
          id: citationKey,
          runId: run.id,
          sourceIds: [...new Set(sourceIds)],
          createdAt: run.finishedAt ?? run.updatedAt,
        });
      }

      const runKey = `run:${run.id}`;
      projected.set(runKey, {
        kind: 'run',
        id: runKey,
        run,
        createdAt: run.finishedAt ?? run.updatedAt,
      });
    }
  }

  return [...projected.values()].sort(compareTimelineItems);
}

/** 合并消息分页结果时按稳定消息 ID 去重，并保持数据库正序。 */
export function mergeAiThreadHistoryItems(
  current: AiThreadMessageHistoryItem[],
  incoming: AiThreadMessageHistoryItem[],
): AiThreadMessageHistoryItem[] {
  const merged = new Map<string, AiThreadMessageHistoryItem>();

  for (const item of [...current, ...incoming]) {
    merged.set(item.message.id, item);
  }

  return [...merged.values()].sort(
    (left, right) =>
      left.message.createdAt.localeCompare(right.message.createdAt) ||
      left.message.id.localeCompare(right.message.id),
  );
}

/** 把持久化文本消息转换为 useChat 可恢复和可重试的类型安全消息。 */
export function toAiDecisionUiMessages(items: AiThreadMessageHistoryItem[]): AiDecisionUiMessage[] {
  return items.map(({ message }) => ({
    id: message.id,
    role: message.role === 'USER' ? 'user' : 'assistant',
    parts: [{ type: 'text', text: message.content }],
  }));
}

/** 同一时间戳下保持消息、工具、引用、Run 状态的稳定业务顺序。 */
function compareTimelineItems(left: AiThreadTimelineItem, right: AiThreadTimelineItem): number {
  return (
    left.createdAt.localeCompare(right.createdAt) ||
    timelinePriority(left) - timelinePriority(right) ||
    left.id.localeCompare(right.id)
  );
}

/** 返回同一时间戳下的结构化部件显示优先级。 */
function timelinePriority(item: AiThreadTimelineItem): number {
  switch (item.kind) {
    case 'message':
      return item.message.role === 'USER' ? 0 : 2;
    case 'tool':
      return 1;
    case 'citations':
      return 3;
    case 'run':
      return 4;
  }
}
