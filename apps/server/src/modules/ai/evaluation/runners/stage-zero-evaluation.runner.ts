/**
 * 本文件编排第 0 阶段完整确定性评测，
 * 聚合三种模拟检索、V4 Mock 模型、三层指标、门禁和失败样本。
 */
import { AI_DECISION_PROCESS_FIXTURE_V1 } from '../fixtures/ai-decision-process.fixture';
import { AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1 } from '../fixtures/ai-stage-zero-gold-query.fixture';
import { calculateAnswerMetrics } from '../metrics/answer.metrics';
import { roundMetric } from '../metrics/metric-math';
import { calculateRetrieverMetrics } from '../metrics/retriever.metrics';
import { calculateSystemMetrics } from '../metrics/system.metrics';
import { buildMockRetrieverObservations } from './mock-retriever.runner';
import {
  runMockEmbeddingProbe,
  runMockLanguageEvaluation,
} from './mock-model.runner';
import type {
  AiEvaluationFailedSample,
  AiEvaluationGateResult,
  AiEvaluationRetrieverMode,
  AiRetrieverEvaluationRun,
  AiStageZeroEvaluationReportV1,
} from '../types/ai-evaluation-run.types';

/** 创建一个大于等于阈值的版本化门禁结果。 */
function createGteGate(
  id: string,
  description: string,
  actual: number,
  threshold: number,
): AiEvaluationGateResult {
  return {
    id,
    description,
    actual: roundMetric(actual),
    operator: 'gte',
    threshold,
    passed: actual >= threshold,
  };
}

/** 创建一个必须等于阈值的版本化门禁结果。 */
function createEqGate(
  id: string,
  description: string,
  actual: number,
  threshold: number,
): AiEvaluationGateResult {
  return {
    id,
    description,
    actual: roundMetric(actual),
    operator: 'eq',
    threshold,
    passed: actual === threshold,
  };
}

/** 收集三层指标中需要在报告里定位的失败样本。 */
function collectFailedSamples(
  retrieverRuns: readonly AiRetrieverEvaluationRun[],
  answerFailedQueryIds: readonly string[],
  systemFailedQueryIds: readonly string[],
): readonly AiEvaluationFailedSample[] {
  const failedSamples: AiEvaluationFailedSample[] = [];

  for (const run of retrieverRuns) {
    for (const queryId of run.metrics.failedQueryIds) {
      failedSamples.push({
        layer: 'retriever',
        queryId,
        reason: run.mode + ' 模拟基线未完整召回相关来源或触发了权限门禁。',
      });
    }
  }

  for (const queryId of answerFailedQueryIds) {
    failedSamples.push({
      layer: 'answer',
      queryId,
      reason: '固定回答未满足引用、忠实度、答案要点或拒答门禁。',
    });
  }

  for (const queryId of systemFailedQueryIds) {
    failedSamples.push({
      layer: 'system',
      queryId,
      reason: '固定系统观察值未满足工具、取消或降级门禁。',
    });
  }

  return failedSamples;
}

/** 运行完整第 0 阶段确定性评测并返回版本化报告。 */
export async function createStageZeroEvaluationReport(): Promise<AiStageZeroEvaluationReportV1> {
  const retrieverModes: readonly AiEvaluationRetrieverMode[] = [
    'keyword',
    'vector',
    'hybrid',
  ];
  const retrieverRuns = retrieverModes.map((mode): AiRetrieverEvaluationRun => {
    const observations = buildMockRetrieverObservations(
      AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1,
      mode,
    );

    return {
      mode,
      configurationVersion: 'mock-ranked-fixture-v1',
      metrics: calculateRetrieverMetrics(
        AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1,
        observations,
      ),
    };
  });
  const languageEvaluation = await runMockLanguageEvaluation(
    AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1,
  );
  const embeddingProbe = await runMockEmbeddingProbe();
  const answerMetrics = calculateAnswerMetrics(
    AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1,
    languageEvaluation.answerObservations,
  );
  const systemMetrics = calculateSystemMetrics(
    languageEvaluation.systemObservations,
  );
  const keywordMetrics = retrieverRuns.find(
    (run) => run.mode === 'keyword',
  )?.metrics;
  const vectorMetrics = retrieverRuns.find(
    (run) => run.mode === 'vector',
  )?.metrics;
  const hybridMetrics = retrieverRuns.find(
    (run) => run.mode === 'hybrid',
  )?.metrics;

  if (!keywordMetrics || !vectorMetrics || !hybridMetrics) {
    throw new Error('第 0 阶段缺少关键词、向量或混合检索指标。');
  }

  if (
    languageEvaluation.languageModelCallCount !==
      AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1.queries.length ||
    embeddingProbe.vectorCount !== 3 ||
    embeddingProbe.embeddingModelCallCount !== 1
  ) {
    throw new Error('AI SDK V4 Mock 模型没有按确定性合同完成调用。');
  }

  const totalPermissionLeakSourceCount = retrieverRuns.reduce(
    (sum, run) => sum + run.metrics.permissionLeakSourceCount,
    0,
  );
  const hybridRecallImprovement =
    hybridMetrics.recallAt20 -
    Math.max(keywordMetrics.recallAt20, vectorMetrics.recallAt20);
  const gates = [
    createEqGate(
      'permission-leak-zero',
      '任何检索配置的越权来源数必须为 0。',
      totalPermissionLeakSourceCount,
      0,
    ),
    createEqGate(
      'citation-leak-zero',
      '引用不得指向禁止来源。',
      answerMetrics.citationLeakSourceCount,
      0,
    ),
    createGteGate(
      'hybrid-recall-at-20',
      '混合模拟检索 Recall@20 不低于 0.85。',
      hybridMetrics.recallAt20,
      0.85,
    ),
    createGteGate(
      'hybrid-improvement',
      '混合模拟检索相对最佳单路 Recall@20 至少提升 0.05。',
      hybridRecallImprovement,
      0.05,
    ),
    createGteGate(
      'citation-coverage',
      '主要结论引用覆盖率不低于 0.90。',
      answerMetrics.citationCoverage,
      0.9,
    ),
    createGteGate(
      'citation-accuracy',
      '引用准确率不低于 0.95。',
      answerMetrics.citationAccuracy,
      0.95,
    ),
    createGteGate(
      'no-answer-accuracy',
      '无答案判断准确率不低于 0.90。',
      answerMetrics.noAnswerAccuracy,
      0.9,
    ),
    createEqGate(
      'high-risk-fact-zero',
      '高风险精确事实不允许无依据生成。',
      answerMetrics.unsupportedHighRiskFactCount,
      0,
    ),
    createGteGate(
      'tool-selection',
      'Mock 系统工具选择准确率为 100%。',
      systemMetrics.toolSelectionAccuracy,
      1,
    ),
    createGteGate(
      'cancellation',
      'Mock 取消场景必须被确定性处理。',
      systemMetrics.cancellationSuccessRate,
      1,
    ),
    createGteGate(
      'degradation',
      'Mock 降级场景必须被确定性处理。',
      systemMetrics.degradationSuccessRate,
      1,
    ),
  ];

  return {
    reportVersion: 'ai-stage-zero-report-v1',
    generatedAt: '2026-08-20T00:00:00.000Z',
    executionMode: 'deterministic_mock',
    datasetVersion: AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1.datasetVersion,
    fixtureVersion: AI_DECISION_PROCESS_FIXTURE_V1.fixtureVersion,
    aiSdkVersion: '7.0.18',
    languageModelVersion: 'mock-language-model-v4-stage-zero',
    embeddingModelVersion: 'mock-embedding-model-v4-stage-zero',
    retrieverRuns,
    answerMetrics,
    systemMetrics,
    gates,
    failedSamples: collectFailedSamples(
      retrieverRuns,
      answerMetrics.failedQueryIds,
      systemMetrics.failedQueryIds,
    ),
    notes: [
      '本报告只验证脱敏 Fixture、指标公式、权限门禁和 Mock 状态流，不代表生产 RAG 质量。',
      '关键词、向量和混合排序均为可重复的模拟基线；接入真实检索后必须复用同一报告合同重新测量。',
      'AI SDK V4 MockLanguageModel 与 MockEmbeddingModel 均已实际调用，未访问真实模型或产生费用。',
      '真实业务样本只能放入 Git 忽略的 fixtures/private 目录。',
    ],
  };
}
