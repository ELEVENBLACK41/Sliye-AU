/**
 * AI Run 生命周期串行调度器回归测试。
 * 验证同线程后继 Run 会按顺序执行，且认领失败时立即停止。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { runAiRunChain } from './ai-run-chain.ts';

test('后继 Run 会在前一条完成后按顺序执行', async () => {
  const claimedRunIds: string[] = [];
  const executedRunIds: string[] = [];

  await runAiRunChain(
    'run-1',
    async (runId) => {
      claimedRunIds.push(runId);
      return { runId };
    },
    async ({ runId }) => {
      executedRunIds.push(runId);
      return runId === 'run-1' ? 'run-2' : null;
    },
  );

  assert.deepEqual(claimedRunIds, ['run-1', 'run-2']);
  assert.deepEqual(executedRunIds, ['run-1', 'run-2']);
});

test('Run 无法认领时不会进入执行阶段', async () => {
  let executionCount = 0;

  await runAiRunChain(
    'run-1',
    async () => null,
    async () => {
      executionCount += 1;
      return null;
    },
  );

  assert.equal(executionCount, 0);
});
