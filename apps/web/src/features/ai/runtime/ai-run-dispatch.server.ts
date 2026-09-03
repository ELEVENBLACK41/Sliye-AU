/**
 * 本文件负责在 BFF 成功创建或释放 Run 之后启动 Agent Runtime。
 *
 * 浏览器只提交意图，执行器由服务端自行启动：这样订阅流可以保持“只补拉、不启动”，
 * 刷新和多标签页订阅都不会产生第二个执行器。领取本身是原子的，
 * 因此重复调用同一个 runId 也不会造成并发执行。
 *
 * 读取转发结果必须在返回响应之前完成：响应发出后消息体已被消费，
 * 此时再 clone 会失败，因此这里先解析出 runId，只把真正的执行推迟到 `after()`。
 */
import 'server-only';

import { after } from 'next/server';

import { startAiAgentRun } from './ai-agent-runtime.server.ts';

/** 统一响应中可能携带新 Run 标识的字段。 */
type RunIdField = 'runId' | 'nextRunId';

/**
 * 从 BFF 转发结果中读取新创建的 Run，并安排在响应返回后启动执行器。
 * 转发失败、响应不符合统一契约或没有新 Run 时静默跳过。
 */
export async function scheduleAgentRunFromProxyResponse(response: Response, field: RunIdField): Promise<void> {
  if (!response.ok) {
    return;
  }

  const runId = await readRunId(response, field);

  if (runId) {
    after(() => startAiAgentRun(runId));
  }
}

/** 安全读取统一响应中的 Run 标识；解析失败时返回 null。 */
async function readRunId(response: Response, field: RunIdField): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as unknown;

    if (!body || typeof body !== 'object' || !('success' in body) || body.success !== true) {
      return null;
    }

    const data = (body as { data?: unknown }).data;

    if (!data || typeof data !== 'object') {
      return null;
    }

    const runId = (data as Record<string, unknown>)[field];

    return typeof runId === 'string' && runId.length > 0 ? runId : null;
  } catch {
    return null;
  }
}
