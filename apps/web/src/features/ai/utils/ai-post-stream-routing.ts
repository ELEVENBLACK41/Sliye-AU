/**
 * 本文件定义 POST 直出流事件的 Thread/Run 归属判断。
 *
 * 同一 Thread 可能同时存在当前回答和排队、调整方向或重试提交的 POST 请求，
 * 因此只按 Thread 过滤会让旧 Run 的终态或迟到错误覆盖新 Run。
 */

import type { AiPostStreamCoordinatorEvent } from '../components/ai-post-stream-provider';

/** 判断一条 POST 流事件是否属于当前工作区正在处理的 Thread 与 Run。 */
export function isAiPostStreamEventForCurrentRun(
  event: AiPostStreamCoordinatorEvent,
  options: {
    /** 当前路由中的 Thread 标识；新会话尚未生成 Thread 时为空。 */
    threadId: string | undefined;
    /** 协调器已经从 submission 得到的 Thread 标识。 */
    postStreamThreadId: string | null;
    /** 当前工作区正在展示的 Run 标识。 */
    activeRunId: string | null;
  },
): boolean {
  if (event.kind === 'SUBMISSION') {
    return event.source === 'NEW_THREAD'
      ? options.threadId === undefined || options.threadId === event.data.threadId
      : options.threadId === event.data.threadId;
  }

  const expectedThreadId = options.postStreamThreadId ?? options.threadId;
  const eventThreadId = getPostStreamEventThreadId(event);

  if (eventThreadId !== expectedThreadId) {
    return false;
  }

  const eventRunId = getPostStreamEventRunId(event);

  return eventRunId === null || options.activeRunId === null || eventRunId === options.activeRunId;
}

/** 取得事件所属的 Thread；提交前错误可能没有 Thread 标识。 */
function getPostStreamEventThreadId(
  event: Exclude<AiPostStreamCoordinatorEvent, { kind: 'SUBMISSION' }>,
): string | null {
  if (event.kind === 'LIVE_DELTA') return event.data.threadId;
  if (event.kind === 'AI_EVENT') return event.threadId;
  if (event.kind === 'RUN_STATUS' || event.kind === 'HANDOFF') return event.data.threadId;
  if (event.kind === 'STREAM_ERROR' || event.kind === 'FAILED') return event.threadId;

  return event.submission.threadId;
}

/** 取得事件所属的 Run；提交前错误或未知事件负载可能没有 Run 标识。 */
function getPostStreamEventRunId(event: Exclude<AiPostStreamCoordinatorEvent, { kind: 'SUBMISSION' }>): string | null {
  if (event.kind === 'LIVE_DELTA') return event.data.runId;
  if (event.kind === 'RUN_STATUS' || event.kind === 'HANDOFF') return event.data.runId;
  if (event.kind === 'STREAM_ERROR' || event.kind === 'FAILED') return event.runId;
  if (event.kind === 'COMPLETED') return event.submission.runId;

  if (event.data && typeof event.data === 'object' && 'runId' in event.data) {
    const runId = (event.data as { runId?: unknown }).runId;

    return typeof runId === 'string' ? runId : null;
  }

  return null;
}
