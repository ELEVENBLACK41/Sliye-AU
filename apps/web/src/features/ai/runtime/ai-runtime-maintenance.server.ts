/**
 * 本文件在常驻 Next.js Node Runtime 中周期收敛过期 AI Run，并重新派发对账
 * 交回的排队 Run（终态事务领取的后继 Run 与从未被领取的孤儿 Run）。
 * PostgreSQL 仍是权威状态，领取本身是原子的，进程定时器只负责触发协调，
 * 因此多实例同时运行本循环是安全的。
 */
import 'server-only';

import { hasAiRuntimeServiceToken, reconcileAiRuntimeRuns } from './ai-runtime-client.server.ts';
import { startAiAgentRun } from './ai-agent-runtime.server.ts';

/** 扫描间隔小于 30 秒执行租约，保证进程重启后能及时释放门禁。 */
const AI_RUNTIME_RECONCILIATION_INTERVAL_MS = 10_000;

/**
 * 连续失败时的日志抽样间隔（单位为轮次）。
 * NestJS 未启动时对账会一直失败，只跑 web 的开发场景不应被刷屏，
 * 因此第一次失败照常记录，之后每隔若干轮才记录一次。
 */
const AI_RUNTIME_FAILURE_LOG_EVERY = 30;

/** 开发热更新下复用的进程级维护状态。 */
type AiRuntimeMaintenanceState = {
  /** 是否已有一轮对账正在执行。 */
  running: boolean;
  /** 当前进程持有的周期定时器。 */
  timer?: ReturnType<typeof setInterval>;
  /** 连续失败轮次，用于抽样记录日志并在恢复后归零。 */
  consecutiveFailureCount: number;
};

/** 为 globalThis 增加当前模块专用的维护状态槽。 */
const runtimeGlobal = globalThis as typeof globalThis & {
  __nextnestAiRuntimeMaintenance?: AiRuntimeMaintenanceState;
};

/** 启动一次进程级 AI Runtime 对账循环；重复调用不会创建第二个定时器。 */
export function startAiRuntimeMaintenance(): void {
  if (!hasAiRuntimeServiceToken()) {
    return;
  }

  const state = (runtimeGlobal.__nextnestAiRuntimeMaintenance ??= {
    running: false,
    consecutiveFailureCount: 0,
  });
  if (state.timer) {
    return;
  }

  void reconcileAndDispatch(state);
  state.timer = setInterval(() => void reconcileAndDispatch(state), AI_RUNTIME_RECONCILIATION_INTERVAL_MS);
  state.timer.unref?.();
}

/** 串行执行一轮对账，并重新派发对账交回的排队 Run。 */
async function reconcileAndDispatch(state: AiRuntimeMaintenanceState): Promise<void> {
  if (state.running) {
    return;
  }

  state.running = true;
  try {
    const result = await reconcileAiRuntimeRuns();
    state.consecutiveFailureCount = 0;
    // startAiAgentRun 自行吞掉执行异常，这里不阻塞下一轮扫描。
    result.nextRunIds.forEach((runId) => void startAiAgentRun(runId));
  } catch (error: unknown) {
    logSampledFailure(state, error);
  } finally {
    state.running = false;
  }
}

/** 抽样记录连续失败，避免上游长期不可用时把日志刷满。 */
function logSampledFailure(state: AiRuntimeMaintenanceState, error: unknown): void {
  state.consecutiveFailureCount += 1;

  if (state.consecutiveFailureCount % AI_RUNTIME_FAILURE_LOG_EVERY === 1) {
    console.error('[ai-runtime-maintenance] 过期运行对账失败', {
      consecutiveFailureCount: state.consecutiveFailureCount,
      error,
    });
  }
}
