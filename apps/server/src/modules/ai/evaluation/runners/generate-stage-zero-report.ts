/**
 * 本文件提供第 0 阶段评测报告生成入口，
 * 将同一次确定性运行写入版本化 JSON 与 Markdown 文件。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  serializeStageZeroReportJson,
  serializeStageZeroReportMarkdown,
} from './evaluation-report.serializer';
import { createStageZeroEvaluationReport } from './stage-zero-evaluation.runner';

/** 生成并写入第 0 阶段两个版本化报告文件。 */
async function generateStageZeroReports(): Promise<void> {
  const report = await createStageZeroEvaluationReport();
  const failedGates = report.gates.filter((gate) => !gate.passed);
  const reportDirectory = path.resolve(__dirname, '../reports');
  const jsonPath = path.join(
    reportDirectory,
    'stage-zero-evaluation-report-v1.json',
  );
  const markdownPath = path.join(
    reportDirectory,
    'stage-zero-evaluation-report-v1.md',
  );

  await mkdir(reportDirectory, { recursive: true });
  await Promise.all([
    writeFile(jsonPath, serializeStageZeroReportJson(report), 'utf8'),
    writeFile(markdownPath, serializeStageZeroReportMarkdown(report), 'utf8'),
  ]);

  if (failedGates.length > 0) {
    throw new Error(
      '第 0 阶段评测报告已生成，但存在未通过门禁：' +
        failedGates.map((gate) => gate.id).join(', '),
    );
  }

  process.stdout.write('已生成第 0 阶段 JSON/Markdown 评测报告。\n');
}

void generateStageZeroReports().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);

  process.stderr.write(message + '\n');
  process.exitCode = 1;
});
