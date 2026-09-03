/**
 * 本文件计算 System 层的工具选择、延迟、Token、成本、取消和降级指标，
 * 所有输入都来自固定 Mock 运行，不读取真实模型或生产监控数据。
 */
import { calculatePercentile, roundMetric, safeDivide } from './metric-math';
import type {
  AiSystemEvaluationMetrics,
  AiSystemEvaluationObservation,
} from '../types/ai-evaluation-run.types';

/** 聚合系统层固定观察值并返回可报告指标。 */
export function calculateSystemMetrics(
  observations: readonly AiSystemEvaluationObservation[],
): AiSystemEvaluationMetrics {
  let correctToolCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let cancellationCount = 0;
  let handledCancellationCount = 0;
  let degradationCount = 0;
  let handledDegradationCount = 0;
  const failedQueryIds = new Set<string>();

  for (const observation of observations) {
    const toolMatches = observation.selectedTool === observation.expectedTool;

    correctToolCount += toolMatches ? 1 : 0;
    totalInputTokens += observation.inputTokens;
    totalOutputTokens += observation.outputTokens;
    totalCostUsd += observation.costUsd;

    if (observation.cancellationRequested) {
      cancellationCount += 1;
      handledCancellationCount += observation.cancellationHandled ? 1 : 0;
    }

    if (observation.degradationRequested) {
      degradationCount += 1;
      handledDegradationCount += observation.degradationHandled ? 1 : 0;
    }

    if (
      !toolMatches ||
      (observation.cancellationRequested && !observation.cancellationHandled) ||
      (observation.degradationRequested && !observation.degradationHandled)
    ) {
      failedQueryIds.add(observation.queryId);
    }
  }

  return {
    queryCount: observations.length,
    toolSelectionAccuracy: roundMetric(
      safeDivide(correctToolCount, observations.length, 0),
    ),
    latencyP50Ms: calculatePercentile(
      observations.map((observation) => observation.latencyMs),
      0.5,
    ),
    latencyP95Ms: calculatePercentile(
      observations.map((observation) => observation.latencyMs),
      0.95,
    ),
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd: roundMetric(totalCostUsd),
    cancellationSuccessRate: roundMetric(
      safeDivide(handledCancellationCount, cancellationCount),
    ),
    degradationSuccessRate: roundMetric(
      safeDivide(handledDegradationCount, degradationCount),
    ),
    failedQueryIds: [...failedQueryIds].sort(),
  };
}
