/**
 * 本文件回归验证 2.6 BFF 输入白名单与权威持久化消息到 Agent 上下文的映射。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiMessage } from '@workspace/contracts/ai';

import {
  aiChatStreamRequestSchema,
  aiThreadMessagesQuerySchema,
  aiThreadUpdateRequestSchema,
  getLatestUserMessageText,
} from '../schemas/ai-request.schema.ts';
import { toAiContextUiMessages } from './ai-authoritative-context.ts';

/** 创建可复用的持久化消息测试样例。 */
function createMessage(overrides: Partial<AiMessage>): AiMessage {
  return {
    id: crypto.randomUUID(),
    threadId: 'c8b1cc55-1f3b-4620-8022-02f24c11fa7b',
    runId: null,
    authorUserId: 1,
    role: 'USER',
    content: '默认消息',
    createdAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

test('后续上下文只按 Nest 持久化消息的顺序恢复纯文本角色', () => {
  const messages = [
    createMessage({ id: '7baad642-69c8-4f42-9360-97bf056a2015', content: '第一问' }),
    createMessage({
      id: 'd62d973f-7e90-4d0f-80ba-b44e22f42b90',
      runId: '9718324e-dae1-4277-af76-a570884931ad',
      authorUserId: null,
      role: 'ASSISTANT',
      content: '第一答',
    }),
    createMessage({ id: '1d1d7768-f543-44ba-bb1c-780d3a73f1f1', content: '第二问' }),
  ];

  assert.deepEqual(toAiContextUiMessages(messages), [
    {
      id: messages[0]!.id,
      role: 'user',
      parts: [{ type: 'text', text: '第一问' }],
    },
    {
      id: messages[1]!.id,
      role: 'assistant',
      parts: [{ type: 'text', text: '第一答' }],
    },
    {
      id: messages[2]!.id,
      role: 'user',
      parts: [{ type: 'text', text: '第二问' }],
    },
  ]);
});

test('浏览器请求只提取最新用户文本并拒绝伪造消息结构', () => {
  const valid = aiChatStreamRequestSchema.safeParse({
    decisionId: 9,
    clientRequestId: '9718324e-dae1-4277-af76-a570884931ad',
    messages: [
      { role: 'user', parts: [{ type: 'text', text: '旧问题' }] },
      { role: 'assistant', parts: [{ type: 'text', text: '旧回答' }] },
      {
        role: 'user',
        parts: [
          { type: 'tool-getDecisionContext', output: { internal: '不可进入上下文' } },
          { type: 'text', text: '  当前问题  ' },
        ],
      },
    ],
  });

  assert.equal(valid.success, true);
  assert.equal(valid.success ? getLatestUserMessageText(valid.data.messages) : null, '当前问题');
  assert.equal(
    aiChatStreamRequestSchema.safeParse({
      decisionId: 9,
      clientRequestId: '9718324e-dae1-4277-af76-a570884931ad',
      messages: [null],
    }).success,
    false,
  );
});

test('Thread 更新与消息查询只接受约定字段和边界', () => {
  const emojiTitle = `  ${'决'.repeat(58)}😀  `;
  const update = aiThreadUpdateRequestSchema.safeParse({ title: emojiTitle, archived: false });

  assert.equal(update.success, true);
  assert.equal(update.success ? update.data.title : null, `${'决'.repeat(58)}😀`);
  assert.equal(aiThreadUpdateRequestSchema.safeParse({}).success, false);
  assert.equal(aiThreadUpdateRequestSchema.safeParse({ title: '有效', ownerUserId: 2 }).success, false);
  assert.equal(aiThreadUpdateRequestSchema.safeParse({ title: '😀'.repeat(61) }).success, false);
  assert.equal(aiThreadMessagesQuerySchema.safeParse({ limit: '100' }).success, true);
  assert.equal(aiThreadMessagesQuerySchema.safeParse({ limit: '101' }).success, false);
  assert.equal(aiThreadMessagesQuerySchema.safeParse({ limit: '10', runId: '伪造' }).success, false);
});
