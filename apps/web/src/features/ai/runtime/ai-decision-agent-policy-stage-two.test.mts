/**
 * 本文件验证第 2.4 阶段生产 Agent 指令持续包含离题拒答、标题精确比较和 Thread 固定范围门禁。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DECISION_AGENT_INSTRUCTIONS } from '../agents/decision-agent-instructions.ts';

test('生产 Agent 指令必须拒绝四类离题请求且不能在工具调用后继续回答', () => {
  for (const requiredPhrase of ['React 教程', '天气', '通用写作', '无关代码生成', '即使已经调用工具']) {
    assert.match(DECISION_AGENT_INSTRUCTIONS, new RegExp(requiredPhrase));
  }
});

test('生产 Agent 指令必须固定 Thread 范围并按 Unicode 字符精确比较标题', () => {
  for (const requiredPhrase of [
    'Thread 的 Decision 绑定由服务端固定',
    '新建会话',
    '逐个 Unicode 字符精确比较',
    '空格、标点、大小写',
    '完全一致',
    '不完全一致',
  ]) {
    assert.match(DECISION_AGENT_INSTRUCTIONS, new RegExp(requiredPhrase));
  }
});
