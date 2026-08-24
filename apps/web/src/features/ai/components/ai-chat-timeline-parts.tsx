/**
 * 本文件渲染 AI 会话中已持久化与实时到达的时间流部件，统一正文、工具、引用和 Run 状态展示。
 */

import type { AiRunPublicSummary, AiThreadDetail } from '@workspace/contracts/ai';

import type { AiDecisionUiMessage } from '../types/ai-message';
import { createAiToolCallIdentity } from '../utils/ai-chat-session';
import type { AiThreadTimelineItem } from '../utils/ai-thread-timeline';
import { toLiveAiToolCallView } from '../utils/ai-tool-call-view';
import { AiCitationList } from './ai-citation-list';
import { AiHistoryHiddenNotice } from './ai-history-hidden-notice';
import { AiMessage } from './ai-message';
import { AiRunStatusCard } from './ai-run-status-card';
import { AiToolCallCard } from './ai-tool-call-card';

/** 历史时间流部件属性。 */
type AiHistoricalTimelinePartProps = {
  /** 已确定排序的持久化部件。 */
  item: AiThreadTimelineItem;
  /** 当前 Thread 定位范围。 */
  thread: AiThreadDetail | null;
  /** 是否正在提交重试。 */
  retrying: boolean;
  /** 创建关联新 Run。 */
  onRetry: (run: AiRunPublicSummary) => Promise<void>;
};

/** 使用与首次流相同的组件渲染一条持久化时间流部件。 */
export function AiHistoricalTimelinePart({ item, thread, retrying, onRetry }: AiHistoricalTimelinePartProps) {
  switch (item.kind) {
    case 'message':
      return (
        <AiMessage
          id={item.message.id}
          role={item.message.role === 'USER' ? 'user' : 'assistant'}
          content={item.message.content}
        />
      );
    case 'tool':
      return <AiToolCallCard tool={item.tool} />;
    case 'citations':
      return thread ? (
        <AiCitationList
          sourceIds={item.sourceIds}
          projectId={thread.project?.id ?? 0}
          decisionId={thread.decision?.id ?? 0}
        />
      ) : null;
    case 'hidden':
      return <AiHistoryHiddenNotice contentKind={item.contentKind} reason={item.reason} />;
    case 'run': {
      const isLatestRetryableRun = thread?.activeRunId === null && thread.latestRun?.id === item.run.id;
      return (
        <AiRunStatusCard
          run={item.run}
          isRetrying={retrying}
          onRetry={isLatestRetryableRun ? () => onRetry(item.run) : undefined}
        />
      );
    }
  }
}

/** 实时 UIMessage 部件属性。 */
type AiLiveMessagePartsProps = {
  /** AI SDK 当前消息。 */
  message: AiDecisionUiMessage;
  /** 当前浏览器流是否仍在生成正文。 */
  streaming: boolean;
  /** 当前实时消息所属的 Run 主键。 */
  runId: string | null;
  /** 已加载的 Thread 业务范围。 */
  thread: AiThreadDetail | null;
  /** Thread 详情到达前使用的已校验 Decision 主键。 */
  fallbackDecisionId: number;
  /** 已由历史恢复展示的 `Run + 工具调用` 复合键，避免同一 Run 重复卡片。 */
  persistedToolCallKeys: ReadonlySet<string>;
};

/** 按 AI SDK 部件原顺序渲染实时正文、工具状态和稳定来源。 */
export function AiLiveMessageParts({
  message,
  streaming,
  runId,
  thread,
  fallbackDecisionId,
  persistedToolCallKeys,
}: AiLiveMessagePartsProps) {
  if (message.role === 'user') {
    const content = message.parts
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    return content ? <AiMessage id={message.id} role="user" content={content} /> : null;
  }

  return message.parts.map((part, index) => {
    if (part.type === 'text') {
      return part.text ? (
        <AiMessage
          key={`${message.id}-text-${index}`}
          id={`${message.id}-text-${index}`}
          role="assistant"
          content={part.text}
          streaming={streaming}
        />
      ) : null;
    }

    if (part.type !== 'tool-getDecisionContext') {
      return null;
    }

    const toolCallKey = createAiToolCallIdentity(runId ?? 'pending', part.toolCallId);
    if (runId && persistedToolCallKeys.has(toolCallKey)) {
      return null;
    }

    const tool = toLiveAiToolCallView(part);
    return (
      <div key={toolCallKey}>
        <AiToolCallCard tool={tool} />
        <AiCitationList
          sourceIds={tool.sourceIds}
          projectId={thread?.project?.id ?? 0}
          decisionId={thread?.decision?.id ?? fallbackDecisionId}
        />
      </div>
    );
  });
}
