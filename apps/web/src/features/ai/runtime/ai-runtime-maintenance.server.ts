/**
 * 本文件在常驻 Next.js Node Runtime 中周期收敛过期 AI Run，并启动对账事务
 * 已领取的后续排队 Run。PostgreSQL 仍是权威状态，进程定时器只负责触发协调。
 */
import 'server-only';

import { reconcileAiRuntimeRuns } from './ai-runtime-client.server.ts';
import { startAiAgentRun } from './ai-agent-runtime.server.ts';

/** 扫描间隔小于 30 秒执行租约，保证进程重启后能及时释放门禁。 */
const AI_RUNTIME_RECONCILIATION_INTERVAL_MS = 10_000;

/** 开发热更新下复用的进程级维护状态。 */
type AiRuntimeMaintenanceState = {
  /** 是否已有一轮对账正在执行。 */
  running: boolean;
  /** 当前进程持有的周期定时器。 */
  timer?: ReturnType<typeof setInterval>;
  /** 当前进程持有的恢复执行任务，避免任务被静默丢弃。 */
  activeExecutions: Set<Promise<void>>;
};

/** 为 globalThis 增加当前模块专用的维护状态槽。 */
const runtimeGlobal = globalThis as typeof globalThis & {
  __nextnestAiRuntimeMaintenance?: AiRuntimeMaintenanceState;
};

/** 启动一次进程级 AI Runtime 对账循环；重复调用不会创建第二个定时器。 */
export function startAiRuntimeMaintenance(): void {
  if (!process.env.AI_RUNTIME_SERVICE_TOKEN) {
    return;
  }

  const state = (runtimeGlobal.__nextnestAiRuntimeMaintenance ??= {
    running: false,
    activeExecutions: new Set<Promise<void>>(),
  });
  if (state.timer) {
    return;
  }

  void reconcileAndDispatch(state);
  state.timer = setInterval(() => void reconcileAndDispatch(state), AI_RUNTIME_RECONCILIATION_INTERVAL_MS);
  state.timer.unref?.();
}

/** 持有恢复执行任务，同时允许后续对账按固定周期继续运行。 */
function trackAiAgentRun(state: AiRuntimeMaintenanceState, runId: string): void {
  const execution = startAiAgentRun(runId);
  state.activeExecutions.add(execution);
  void execution.finally(() => {
    state.activeExecutions.delete(execution);
  });
}

/** 串行执行一轮过期 Run 对账，并启动事务已领取的后续 Run。 */
async function reconcileAndDispatch(state: AiRuntimeMaintenanceState): Promise<void> {
  if (state.running) {
    return;
  }

  state.running = true;
  try {
    const result = await reconcileAiRuntimeRuns();
    result.nextRunIds.forEach((runId) => trackAiAgentRun(state, runId));
  } catch (error: unknown) {
    console.error('[ai-runtime-maintenance] 过期运行对账失败', error);
  } finally {
    state.running = false;
  }
}
