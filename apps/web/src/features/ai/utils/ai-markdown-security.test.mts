/**
 * 本文件验证 AI Markdown 链接只允许受控协议，避免首次流与历史恢复出现安全差异。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSafeAiMarkdownUrl } from './ai-markdown-security.ts';

test('Markdown 链接应允许站内路径、HTTP(S)、邮件与锚点', () => {
  const allowedUrls = [
    '/ai/thread-1',
    '/projects?projectId=7&section=decisions',
    'https://example.com/source',
    'HTTP://example.com/source',
    'mailto:owner@example.com',
    '#decision-source',
    '  /ai/thread-2  ',
  ];

  for (const href of allowedUrls) {
    assert.equal(isSafeAiMarkdownUrl(href), true, `应允许链接：${href}`);
  }
});

test('Markdown 链接应拒绝脚本、数据、协议相对和未登记协议', () => {
  const rejectedUrls = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example/steal',
    '///evil.example/steal',
    'ftp://example.com/source',
    'relative/path',
    '',
  ];

  for (const href of rejectedUrls) {
    assert.equal(isSafeAiMarkdownUrl(href), false, `应拒绝链接：${href}`);
  }
});
