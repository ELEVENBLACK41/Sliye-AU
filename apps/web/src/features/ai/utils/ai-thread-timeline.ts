/**
 * 本文件把数据库消息、Run、工具和来源投影为可确定排序、可去重的工作区时间流。
 */

import type {
  AiHistoryContentHiddenReason,
  AiHistoryMessage,
  AiHistoryToolCall,
  AiThreadMessageHistoryItem,
} from '@workspace/contracts/ai';

import type { AiDecisionUiMessage } from '../types/ai-message';

import { createHistoricalAiActivityGroup, type AiActivityGroupView } from './ai-activity-view';
import { toHistoricalAiToolCallView } from './ai-tool-call-view';

/** 历史工作区统一消费的结构化时间流部件。 */
export type AiThreadTimelineItem =
  | {
      /** 用户或助手正文。 */
      kind: 'message';
      /** 稳定消息主键。 */
      id: string;
      /** 持久化消息。 */
      message: Extract<AiHistoryMessage, { visibility: { state: 'VISIBLE' } }>;
      /** ISO 时间用于确定性排序。 */
      createdAt: string;
    }
  | {
      /** 因来源失权或删除而替代原业务内容的中性占位。 */
      kind: 'hidden';
      /** 与原部件保持一致的稳定去重标识。 */
      id: string;
      /** 被隐藏的是助手回答、工具结果还是引用。 */
      contentKind: 'answer' | 'tool' | 'citations';
      /** 服务端允许前端展示的稳定隐藏原因。 */
      reason: AiHistoryContentHiddenReason;
      /** ISO 时间用于保持首次流与历史恢复顺序一致。 */
      createdAt: string;
    }
  | {
      /** 一个 Run 及其可见工具步骤组成的紧凑活动组。 */
      kind: 'activity';
      /** 使用 Run 主键形成的稳定活动组 ID。 */
      id: string;
      /** 所属 Run 主键。 */
      runId: string;
      /** 首次流与历史恢复共用的安全活动组数据。 */
      activity: AiActivityGroupView;
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
      /** 来源 ID 到项目与决策的安全定位信息。 */
      sourceLocations: Record<string, { projectId: number; decisionId: number }>;
      /** ISO 时间用于确定性排序。 */
      createdAt: string;
    };

/** 收窄通过服务端来源复核且仍携带正文的历史消息。 */
function isVisibleHistoryMessage(
  message: AiHistoryMessage,
): message is Extract<AiHistoryMessage, { visibility: { state: 'VISIBLE' } }> {
  return message.visibility.state === 'VISIBLE';
}

/** 收窄通过服务端来源复核且仍携带输入与结果摘要的历史工具调用。 */
function isVisibleHistoryToolCall(
  toolCall: AiHistoryToolCall,
): toolCall is Extract<AiHistoryToolCall, { visibility: { state: 'VISIBLE' } }> {
  return toolCall.visibility.state === 'VISIBLE';
}

/** 将一组历史页条目投影为去重且确定排序的结构化时间流。 */
export function projectAiThreadTimeline(items: AiThreadMessageHistoryItem[]): AiThreadTimelineItem[] {
  const projected = new Map<string, AiThreadTimelineItem>();

  for (const item of items) {
    const messageKey = `message:${item.message.id}`;
    if (isVisibleHistoryMessage(item.message)) {
      projected.set(messageKey, {
        kind: 'message',
        id: messageKey,
        message: item.message,
        createdAt: item.message.createdAt,
      });
    } else {
      projected.set(messageKey, {
        kind: 'hidden',
        id: messageKey,
        contentKind: 'answer',
        reason: item.message.visibility.reason,
        createdAt: item.message.createdAt,
      });
    }

    for (const history of item.runs) {
      const { citations, run, toolCalls } = history;

      const visibleTools = [
        ...new Map(
          toolCalls
            .filter(isVisibleHistoryToolCall)
            .sort(compareHistoryToolCalls)
            .map((toolCall) => [toolCall.toolCallId, toolCall] as const),
        ).values(),
      ].map((toolCall) => toHistoricalAiToolCallView(toolCall, run));

      const activityKey = `activity:${run.id}`;
      projected.set(activityKey, {
        kind: 'activity',
        id: activityKey,
        runId: run.id,
        activity: createHistoricalAiActivityGroup(run, visibleTools),
        createdAt: run.startedAt ?? run.createdAt,
      });

      for (const toolCall of toolCalls) {
        const toolKey = `tool:${run.id}:${toolCall.toolCallId}`;
        if (!isVisibleHistoryToolCall(toolCall)) {
          projected.set(toolKey, {
            kind: 'hidden',
            id: toolKey,
            contentKind: 'tool',
            reason: toolCall.visibility.reason,
            createdAt: toolCall.startedAt ?? toolCall.createdAt,
          });
        }
      }

      if (citations.visibility.state === 'HIDDEN') {
        const citationKey = `citations:${run.id}`;
        projected.set(citationKey, {
          kind: 'hidden',
          id: citationKey,
          contentKind: 'citations',
          reason: citations.visibility.reason,
          createdAt: run.finishedAt ?? run.updatedAt,
        });
      } else if ('sourceIds' in citations && citations.sourceIds.length > 0) {
        const citationKey = `citations:${run.id}`;
        const sourceLocations = Object.fromEntries(
          toolCalls.flatMap((toolCall) => {
            if (!isVisibleHistoryToolCall(toolCall)) {
              return [];
            }
            const summary = toolCall.resultSummary;
            const projectId = summary?.projectId;
            if (!summary || !projectId) return [];

            return summary.sourceIds.map((sourceId) => [
              sourceId,
              {
                projectId,
                decisionId: summary.decisionId,
              },
            ]);
          }),
        );
        projected.set(citationKey, {
          kind: 'citations',
          id: citationKey,
          runId: run.id,
          sourceIds: [...new Set(citations.sourceIds)],
          sourceLocations,
          createdAt: run.finishedAt ?? run.updatedAt,
        });
      }
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
      left.message.createdAt.localeCompare(right.message.createdAt) || left.message.id.localeCompare(right.message.id),
  );
}

/** 把持久化文本消息转换为 useChat 可恢复和可重试的类型安全消息。 */
export function toAiDecisionUiMessages(items: AiThreadMessageHistoryItem[]): AiDecisionUiMessage[] {
  return items.flatMap(({ message }) =>
    isVisibleHistoryMessage(message)
      ? [
          {
            id: message.id,
            role: message.role === 'USER' ? ('user' as const) : ('assistant' as const),
            parts: [{ type: 'text' as const, text: message.content }],
          },
        ]
      : [],
  );
}

/** 同一时间戳下保持消息、活动、正文和引用的稳定业务顺序。 */
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
    case 'activity':
      return 1;
    case 'citations':
      return 3;
    case 'hidden':
      return item.contentKind === 'tool' ? 1 : item.contentKind === 'answer' ? 2 : 3;
  }
}

/** 按后端审计序号、创建时间和工具调用 ID 保持活动步骤的确定顺序。 */
function compareHistoryToolCalls(left: AiHistoryToolCall, right: AiHistoryToolCall): number {
  return (
    left.sequence - right.sequence ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.toolCallId.localeCompare(right.toolCallId)
  );
}
