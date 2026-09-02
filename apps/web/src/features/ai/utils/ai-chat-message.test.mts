/**
 * 本文件验证 C3 useChat 请求边界与 UIMessage 展示适配。
 * 测试不访问网络，只确保新链路不会把完整历史重新发送到 Spike Route。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { AiMessageHistoryItem } from '@workspace/contracts/ai';

import {
  createAiChatRequestBody,
  toAiWorkspaceMessagesFromChat,
  toNextNestWorkspaceAgentUIMessages,
} from './ai-chat-message.ts';

/** 创建一条最小历史消息，供 UIMessage 适配测试复用。 */
function createHistoryMessage(overrides: Partial<AiMessageHistoryItem> = {}): AiMessageHistoryItem {
  return {
    id: 'message-1',
    threadId: 'thread-1',
    runId: null,
    authorUserId: 1,
    role: 'USER',
    dispatchState: 'DISPATCHED',
    queueSequence: 1,
    submissionMode: 'NORMAL',
    content: '第一条问题',
    parts: [{ type: 'text', text: '第一条问题' }],
    metadata: null,
    createdAt: '2026-09-02T00:00:00.000Z',
    run: null,
    contentVisibility: 'VISIBLE',
    ...overrides,
  };
}

test('C3 请求只携带 Thread 标识和最后一条用户 UIMessage', () => {
  const first = { id: 'first', role: 'user' as const, parts: [{ type: 'text' as const, text: '旧问题' }] };
  const last = { id: 'last', role: 'user' as const, parts: [{ type: 'text' as const, text: '新问题' }] };
  const body = createAiChatRequestBody('thread-1', [first, last]);

  assert.deepEqual(body, { threadId: 'thread-1', message: last });
  assert.equal('messages' in body, false);
});

test('历史消息按文本恢复，实时助手工具 part 映射为可见运行状态', () => {
  const history = toNextNestWorkspaceAgentUIMessages([
    createHistoryMessage(),
    createHistoryMessage({
      id: 'assistant-1',
      role: 'ASSISTANT',
      content: '历史回答',
      authorUserId: null,
    }),
  ]);
  const messages = toAiWorkspaceMessagesFromChat(
    [
      ...history,
      {
        id: 'assistant-live',
        role: 'assistant',
        parts: [
          {
            type: 'tool-findDecisionCandidates',
            toolCallId: 'tool-1',
            state: 'input-available',
            input: { query: '预算' },
          },
          { type: 'text', text: '正在查找。' },
        ],
      },
    ],
    'streaming',
  );

  assert.equal(messages[2]?.content, '正在查找。');
  assert.equal(messages[2]?.isStreaming, true);
  assert.equal(messages[2]?.run?.toolCalls[0]?.toolName, 'findDecisionCandidates');
  assert.equal(messages[2]?.run?.toolCalls[0]?.status, 'RUNNING');
});

test('来源失权历史只恢复中性占位，不恢复原正文', () => {
  const [message] = toNextNestWorkspaceAgentUIMessages([
    createHistoryMessage({ content: '', contentVisibility: 'SOURCE_REVOKED', role: 'ASSISTANT', authorUserId: null }),
  ]);

  assert.equal(message?.parts[0]?.type, 'text');
  assert.equal(message?.parts[0]?.text, '这条回答当前无法显示。');
});
