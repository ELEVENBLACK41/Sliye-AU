/**
 * 本文件验证旧版 Thread 列表响应会在服务边界被拒绝，而不会进入历史组件造成白屏。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AI_THREAD_HISTORY_CONTRACT_ERROR_MESSAGE,
  AI_THREAD_SCOPE_LABEL_UNAVAILABLE,
  getAiThreadScopeLabel,
  parseAiThreadPageResponse,
} from './ai-thread-response.ts';

/** 创建当前契约下可展示的最小 Thread 历史页。 */
function createCurrentThreadPage() {
  return {
    items: [
      {
        id: 'thread-current',
        project: { id: 2, title: '真实项目' },
        decision: { id: 10, title: '真实决策' },
        title: '会话标题',
        activeRunId: null,
        latestRun: null,
        archivedAt: null,
        createdAt: '2026-08-23T00:00:00.000Z',
        updatedAt: '2026-08-23T01:00:00.000Z',
      },
    ],
    nextCursor: null,
    hasMore: false,
  };
}

test('当前 Thread 历史契约应通过浏览器服务边界', () => {
  const page = createCurrentThreadPage();
  assert.equal(parseAiThreadPageResponse(page), page);
  assert.equal(getAiThreadScopeLabel(page.items[0]), '真实项目 · 真实决策');
});

test('2.7 无固定业务绑定的 Thread 应通过边界并显示动态范围标签', () => {
  const page = createCurrentThreadPage();
  const dynamicPage = {
    ...page,
    items: page.items.map((item) => ({ ...item, project: null, decision: null })),
  };

  assert.equal(parseAiThreadPageResponse(dynamicPage), dynamicPage);
  assert.equal(getAiThreadScopeLabel(dynamicPage.items[0]), '动态范围会话 · 每次提问按实时权限确定数据范围');
});

test('缺少 project 和 decision 对象的旧响应应转换为稳定错误而不是组件异常', () => {
  const currentPage = createCurrentThreadPage();
  const legacyPage: unknown = {
    ...currentPage,
    items: [
      {
        ...currentPage.items[0]!,
        decisionId: 10,
        project: undefined,
        decision: undefined,
      },
    ],
  };

  assert.throws(
    () => parseAiThreadPageResponse(legacyPage),
    (error: unknown) => error instanceof Error && error.message === AI_THREAD_HISTORY_CONTRACT_ERROR_MESSAGE,
  );
  assert.equal(getAiThreadScopeLabel((legacyPage as { items: unknown[] }).items[0]), AI_THREAD_SCOPE_LABEL_UNAVAILABLE);
});
