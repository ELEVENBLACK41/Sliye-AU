/**
 * 本文件用服务端静态渲染验证流式 Markdown 的未闭合中间态、安全边界与完成态语义。
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { Streamdown, type PluginConfig } from 'streamdown';

/** 使用与 AI 消息一致的核心选项渲染一段流式或完整 Markdown。 */
function renderAiMarkdown(content: string, mode: 'streaming' | 'static'): string {
  const plugins: PluginConfig = {
    cjk,
    code: code as unknown as PluginConfig['code'],
  };

  return renderToStaticMarkup(
    createElement(
      Streamdown,
      {
        isAnimating: mode === 'streaming',
        mode,
        parseIncompleteMarkdown: true,
        plugins,
        skipHtml: true,
      },
      content,
    ),
  );
}

test('未闭合强调、列表、表格和代码围栏在流式中间态不应报错', () => {
  const incompleteSamples = [
    '### 阶段结论\n\n**证据仍在补充',
    '- 已确认事实\n- 正在补充的',
    '| 字段 | 结论 |\n| --- | --- |\n| 状态 | 进行',
    '```ts\nconst status = "running";',
  ];

  for (const sample of incompleteSamples) {
    assert.doesNotThrow(() => renderAiMarkdown(sample, 'streaming'));
  }

  assert.match(
    renderAiMarkdown(incompleteSamples[0]!, 'streaming'),
    /data-streamdown="strong"/,
  );
  assert.match(renderAiMarkdown(incompleteSamples[1]!, 'streaming'), /data-streamdown="unordered-list"/);
  assert.match(renderAiMarkdown(incompleteSamples[2]!, 'streaming'), /data-streamdown="table-wrapper"/);
  assert.match(renderAiMarkdown(incompleteSamples[3]!, 'streaming'), /data-streamdown="code-block"/);
});

test('流式完成态与历史静态态应保留相同 Markdown 语义', () => {
  const completed = [
    '### 结论',
    '',
    '**当前工具证据不足**',
    '',
    '- 保留真实状态',
    '- 不补写事实',
    '',
    '| 字段 | 值 |',
    '| --- | --- |',
    '| 状态 | 已完成 |',
    '',
    '> 仅依据当前来源。',
    '',
    '```ts',
    'const grounded = true;',
    '```',
  ].join('\n');
  const streamedMarkup = renderAiMarkdown(completed, 'streaming');
  const historicalMarkup = renderAiMarkdown(completed, 'static');

  for (const marker of [
    '<h3',
    'data-streamdown="strong"',
    'data-streamdown="unordered-list"',
    'data-streamdown="table-wrapper"',
    '<blockquote',
    'data-streamdown="code-block"',
  ]) {
    assert.match(streamedMarkup, new RegExp(marker));
    assert.match(historicalMarkup, new RegExp(marker));
  }
});

test('原始 HTML 与事件属性在流式和历史渲染中都不得进入输出', () => {
  const hostile = '<script>alert(1)</script><img src="x" onerror="alert(2)">安全正文';

  for (const mode of ['streaming', 'static'] as const) {
    const markup = renderAiMarkdown(hostile, mode);
    assert.doesNotMatch(markup, /<script|<img|onerror=/i);
    assert.match(markup, /安全正文/);
  }
});

test('超长连续正文和宽表格在流式与历史模式下都应稳定渲染', () => {
  const longContent = `超长证据${'决策依据'.repeat(5_000)}`;
  const wideTable = `| ${longContent} | 第二列 |\n| --- | --- |\n| 结论 | ${longContent} |`;

  for (const mode of ['streaming', 'static'] as const) {
    assert.doesNotThrow(() => renderAiMarkdown(wideTable, mode));
    const markup = renderAiMarkdown(wideTable, mode);
    assert.match(markup, /data-streamdown="table-wrapper"/);
    assert.match(markup, /超长证据/);
  }
});
