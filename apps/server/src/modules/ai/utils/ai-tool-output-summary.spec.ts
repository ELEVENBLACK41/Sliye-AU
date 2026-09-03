/**
 * 本文件验证工具窄输出摘要的截断约定：
 * 写入方在结果过大时只保留截断标记，重放方必须能据此拒绝重放。
 */

import {
  MAX_TOOL_OUTPUT_SUMMARY_LENGTH,
  isTruncatedAiToolOutputSummary,
  toAiToolOutputSummary,
} from './ai-tool-output-summary';

describe('AI 工具窄输出摘要', () => {
  it('未超长的输出原样保留且不会被判定为截断', () => {
    const output = { decisionId: 17, title: '缓存方案评审' };

    const summary = toAiToolOutputSummary(output);

    expect(summary).toEqual(output);
    expect(isTruncatedAiToolOutputSummary(summary)).toBe(false);
  });

  it('超长输出只保留截断标记并能被重放方识别', () => {
    const output = { text: 'x'.repeat(MAX_TOOL_OUTPUT_SUMMARY_LENGTH + 1) };

    const summary = toAiToolOutputSummary(output);

    expect(summary).toMatchObject({ truncated: true });
    expect(isTruncatedAiToolOutputSummary(summary)).toBe(true);
  });

  it('空值与非对象摘要不会被误判为截断标记', () => {
    expect(isTruncatedAiToolOutputSummary(null)).toBe(false);
    expect(isTruncatedAiToolOutputSummary(undefined)).toBe(false);
    expect(isTruncatedAiToolOutputSummary('truncated')).toBe(false);
    expect(isTruncatedAiToolOutputSummary([{ truncated: true }])).toBe(false);
  });
});
