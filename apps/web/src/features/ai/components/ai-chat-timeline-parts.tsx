/**
 * 本文件渲染 AI 会话中已持久化与实时到达的时间流部件，统一正文、工具、引用和 Run 状态展示。
 */

import type { AiRunPublicSummary, AiThreadDetail } from '@workspace/contracts/ai';

import type { AiDecisionUiMessage } from '../types/ai-message';
import { createLiveAiActivityGroup, type AiActivityTransportState } from '../utils/ai-activity-view';
import type { AiThreadTimelineItem } from '../utils/ai-thread-timeline';
import { toLiveAiToolCallView } from '../utils/ai-tool-call-view';
import { AiActivityGroup } from './ai-activity-group';
import { AiCitationList } from './ai-citation-list';
import { AiHistoryHiddenNotice } from './ai-history-hidden-notice';
import { AiMessage } from './ai-message';

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
    case 'activity': {
      const isLatestRetryableRun = thread?.activeRunId === null && thread.latestRun?.id === item.activity.runId;
      return (
        <AiActivityGroup
          activity={item.activity}
          retrying={retrying}
          onRetry={isLatestRetryableRun ? onRetry : undefined}
        />
      );
    }
    case 'citations':
      return thread ? (
        <AiCitationList
          sourceIds={item.sourceIds}
          sourceLocations={item.sourceLocations}
          fallbackProjectId={thread.project?.id ?? null}
          fallbackDecisionId={thread.decision?.id ?? null}
        />
      ) : null;
    case 'hidden':
      return <AiHistoryHiddenNotice contentKind={item.contentKind} reason={item.reason} />;
  }
}

/** 实时 UIMessage 部件属性。 */
type AiLiveMessagePartsProps = {
  /** AI SDK 当前消息。 */
  message: AiDecisionUiMessage;
  /** 当前浏览器首次流的真实传输状态；准备完成后为空。 */
  activityStatus: AiActivityTransportState | null;
  /** 当前实时消息所属的 Run 主键。 */
  runId: string | null;
  /** 已加载的 Thread 业务范围。 */
  thread: AiThreadDetail | null;
  /** Thread 详情到达前使用的已校验 Decision 主键。 */
  fallbackDecisionId: number;
};

/** 将首次流投影为活动组、助手正文和独立引用，保持与历史恢复一致的信息层级。 */
export function AiLiveMessageParts({
  message,
  activityStatus,
  runId,
  thread,
  fallbackDecisionId,
}: AiLiveMessagePartsProps) {
  if (message.role === 'user') {
    const content = message.parts
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    return content ? <AiMessage id={message.id} role="user" content={content} /> : null;
  }

  const tools = message.parts
    .filter(
      (part): part is Extract<typeof part, { type: 'tool-getDecisionContext' }> =>
        part.type === 'tool-getDecisionContext',
    )
    .map(toLiveAiToolCallView);
  const sourceIds = [...new Set(tools.flatMap((tool) => tool.sourceIds))];
  const sourceLocations = Object.assign(
    {},
    ...tools.map((tool) => createLiveSourceLocations(tool.resultSummary)),
  ) as Record<string, { projectId: number; decisionId: number }>;
  const activity = activityStatus
    ? createLiveAiActivityGroup({
        runId: runId ?? `pending-${message.id}`,
        status: activityStatus,
        tools,
      })
    : null;

  return (
    <>
      {activity ? <AiActivityGroup key={`${activity.id}:${activity.state}`} activity={activity} /> : null}
      {message.parts.map((part, index) => {
        if (part.type !== 'text' || !part.text) return null;
        return (
          <AiMessage
            key={`${message.id}-text-${index}`}
            id={`${message.id}-text-${index}`}
            role="assistant"
            content={part.text}
            streaming={Boolean(activityStatus)}
          />
        );
      })}
      {sourceIds.length > 0 ? (
        <AiCitationList
          sourceIds={sourceIds}
          sourceLocations={sourceLocations}
          fallbackProjectId={thread?.project?.id ?? null}
          fallbackDecisionId={(thread?.decision?.id ?? fallbackDecisionId) || null}
        />
      ) : null}
    </>
  );
}

/** 从当前工具受控摘要建立跨项目引用定位，不依赖 Thread 兼容绑定。 */
function createLiveSourceLocations(
  summary: ReturnType<typeof toLiveAiToolCallView>['resultSummary'],
): Record<string, { projectId: number; decisionId: number }> {
  if (!summary?.projectId) {
    return {};
  }

  return Object.fromEntries(
    summary.sourceIds.map((sourceId) => [
      sourceId,
      { projectId: summary.projectId as number, decisionId: summary.decisionId },
    ]),
  );
}
