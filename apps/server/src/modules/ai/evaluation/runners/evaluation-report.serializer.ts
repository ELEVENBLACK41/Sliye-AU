/**
 * 本文件把第 0 阶段版本化评测报告序列化为稳定 JSON 和 Markdown，
 * 两种格式均来自同一个报告对象，避免人工维护产生指标差异。
 */
import type {
  AiEvaluationGateResult,
  AiStageZeroEvaluationReportV1,
} from '../types/ai-evaluation-run.types';

/** 将比例指标格式化为固定两位百分比。 */
function formatPercentage(value: number): string {
  return (value * 100).toFixed(2) + '%';
}

/** 将门禁比较符转换为报告中的可读文本。 */
function formatGateOperator(gate: AiEvaluationGateResult): string {
  return gate.operator === 'eq' ? '=' : '≥';
}

/** 将报告对象序列化为稳定且带尾换行的 JSON。 */
export function serializeStageZeroReportJson(
  report: AiStageZeroEvaluationReportV1,
): string {
  return JSON.stringify(report, null, 2) + '\n';
}

/** 将报告对象序列化为便于人工审查的 Markdown。 */
export function serializeStageZeroReportMarkdown(
  report: AiStageZeroEvaluationReportV1,
): string {
  const lines: string[] = [
    '# Decision Agent 第 0 阶段评测报告',
    '',
    '> 本报告由脱敏 Fixture 和 AI SDK V4 Mock 模型确定性生成，不代表生产 RAG 效果。',
    '',
    '## 版本信息',
    '',
    '- 报告版本：' + report.reportVersion,
    '- 固定生成时间：' + report.generatedAt,
    '- 执行模式：' + report.executionMode,
    '- Gold Query：' + report.datasetVersion,
    '- Fixture：' + report.fixtureVersion,
    '- AI SDK：' + report.aiSdkVersion,
    '- 语言模型：' + report.languageModelVersion,
    '- 向量模型：' + report.embeddingModelVersion,
    '',
    '## Retriever',
    '',
    '| 模式 | 配置版本 | Recall@5 | Recall@10 | Recall@20 | MRR | nDCG@20 | 权限泄漏 |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const run of report.retrieverRuns) {
    lines.push(
      '| ' +
        run.mode +
        ' | ' +
        run.configurationVersion +
        ' | ' +
        formatPercentage(run.metrics.recallAt5) +
        ' | ' +
        formatPercentage(run.metrics.recallAt10) +
        ' | ' +
        formatPercentage(run.metrics.recallAt20) +
        ' | ' +
        run.metrics.mrr.toFixed(4) +
        ' | ' +
        run.metrics.ndcgAt20.toFixed(4) +
        ' | ' +
        run.metrics.permissionLeakSourceCount +
        ' |',
    );
  }

  lines.push(
    '',
    '## Answer',
    '',
    '| 指标 | 结果 |',
    '| --- | ---: |',
    '| 引用准确率 | ' +
      formatPercentage(report.answerMetrics.citationAccuracy) +
      ' |',
    '| 引用覆盖率 | ' +
      formatPercentage(report.answerMetrics.citationCoverage) +
      ' |',
    '| 答案要点覆盖率 | ' +
      formatPercentage(report.answerMetrics.answerKeyPointCoverage) +
      ' |',
    '| 主要事实忠实度 | ' +
      formatPercentage(report.answerMetrics.majorFactFaithfulness) +
      ' |',
    '| 无答案准确率 | ' +
      formatPercentage(report.answerMetrics.noAnswerAccuracy) +
      ' |',
    '| 引用泄漏来源数 | ' + report.answerMetrics.citationLeakSourceCount + ' |',
    '| 高风险无依据事实数 | ' +
      report.answerMetrics.unsupportedHighRiskFactCount +
      ' |',
    '',
    '## System',
    '',
    '| 指标 | 结果 |',
    '| --- | ---: |',
    '| 工具选择准确率 | ' +
      formatPercentage(report.systemMetrics.toolSelectionAccuracy) +
      ' |',
    '| 延迟 p50 | ' + report.systemMetrics.latencyP50Ms + ' ms |',
    '| 延迟 p95 | ' + report.systemMetrics.latencyP95Ms + ' ms |',
    '| 输入 Token | ' + report.systemMetrics.totalInputTokens + ' |',
    '| 输出 Token | ' + report.systemMetrics.totalOutputTokens + ' |',
    '| Mock 成本 | $' + report.systemMetrics.totalCostUsd.toFixed(4) + ' |',
    '| 取消成功率 | ' +
      formatPercentage(report.systemMetrics.cancellationSuccessRate) +
      ' |',
    '| 降级成功率 | ' +
      formatPercentage(report.systemMetrics.degradationSuccessRate) +
      ' |',
    '',
    '## 门禁',
    '',
    '| 门禁 | 当前值 | 要求 | 结果 |',
    '| --- | ---: | ---: | --- |',
  );

  for (const gate of report.gates) {
    lines.push(
      '| ' +
        gate.description +
        ' | ' +
        gate.actual +
        ' | ' +
        formatGateOperator(gate) +
        ' ' +
        gate.threshold +
        ' | ' +
        (gate.passed ? '通过' : '失败') +
        ' |',
    );
  }

  lines.push('', '## 失败样本', '');

  if (report.failedSamples.length === 0) {
    lines.push('- 无');
  } else {
    for (const sample of report.failedSamples) {
      lines.push(
        '- [' + sample.layer + '] ' + sample.queryId + '：' + sample.reason,
      );
    }
  }

  lines.push('', '## 说明', '');

  for (const note of report.notes) {
    lines.push('- ' + note);
  }

  return lines.join('\n') + '\n';
}
