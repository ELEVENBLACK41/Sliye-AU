/**
 * AI Run 生命周期串行调度器。
 * 负责在当前 Run 结束后继续认领同线程的下一条 Run，并保持严格串行。
 */

/** 串行认领并执行 Run，直到当前线程没有可继续执行的 Run。 */
export async function runAiRunChain<TSession>(
  initialRunId: string,
  claimRun: (runId: string) => Promise<TSession | null>,
  executeRun: (session: TSession) => Promise<string | null>,
): Promise<void> {
  let pendingRunId: string | null = initialRunId;

  while (pendingRunId) {
    const session = await claimRun(pendingRunId);
    if (!session) {
      return;
    }

    pendingRunId = await executeRun(session);
  }
}
