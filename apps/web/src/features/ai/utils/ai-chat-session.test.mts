/**
 * 本文件验证 AI Chat 的请求裁剪、持久化确认、结算单飞和稳定身份映射。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AiDecisionUiMessage } from '../types/ai-message.ts';

import {
  abandonAiRequestForNavigation,
  beginAiRequestSettlementCycle,
  claimAiRequestSettlement,
  createAiPersistenceReceipt,
  createAiRequestSettlementGate,
  createAiToolCallIdentity,
  finishAiNavigationDisconnect,
  replaceLatestAiUserMessageId,
  selectLatestAiUserMessage,
} from './ai-chat-session.ts';

/** 创建测试所需的最小纯文本 UI 消息。 */
function createMessage(id: string, role: 'user' | 'assistant'): AiDecisionUiMessage {
  return {
    id,
    role,
    parts: [{ type: 'text', text: id }],
  };
}

test('恢复五十条历史后仍只向 BFF 提交最后一条用户消息', () => {
  const messages = Array.from({ length: 50 }, (_, index) =>
    createMessage(`history-${index}`, index % 2 === 0 ? 'user' : 'assistant'),
  );
  const latest = createMessage('latest-user', 'user');

  assert.deepEqual(selectLatestAiUserMessage([...messages, latest]), [latest]);
});

test('数据库消息 ID 回填后只替换最后一条用户消息且保持其他对象', () => {
  const first = createMessage('old-user', 'user');
  const assistant = createMessage('assistant', 'assistant');
  const latest = createMessage('client-user', 'user');
  const replaced = replaceLatestAiUserMessageId([first, assistant, latest], 'database-user');

  assert.equal(replaced[0], first);
  assert.equal(replaced[1], assistant);
  assert.equal(replaced[2]?.id, 'database-user');
  assert.equal(replaceLatestAiUserMessageId(replaced, 'database-user'), replaced);
});

test('同一错误的 onError 与 onFinish 只能认领一次结算', () => {
  const gate = createAiRequestSettlementGate(false);
  beginAiRequestSettlementCycle(gate);

  assert.equal(claimAiRequestSettlement(gate), 1);
  assert.equal(claimAiRequestSettlement(gate), null);
});

test('导航断流不结算而用户停止仍可结算', () => {
  const navigationGate = createAiRequestSettlementGate(false);
  beginAiRequestSettlementCycle(navigationGate);
  abandonAiRequestForNavigation(navigationGate);
  assert.equal(claimAiRequestSettlement(navigationGate), null);
  finishAiNavigationDisconnect(navigationGate);
  assert.equal(claimAiRequestSettlement(navigationGate), null);

  const stopGate = createAiRequestSettlementGate(false);
  beginAiRequestSettlementCycle(stopGate);
  assert.equal(claimAiRequestSettlement(stopGate), 1);
});

test('持久化确认只接受第一次结果且工具身份按 Run 隔离', async () => {
  const receipt = createAiPersistenceReceipt();
  receipt.complete(true);
  receipt.complete(false);

  assert.equal(await receipt.promise, true);
  assert.notEqual(
    createAiToolCallIdentity('run-old', 'shared-tool'),
    createAiToolCallIdentity('run-retry', 'shared-tool'),
  );
});
