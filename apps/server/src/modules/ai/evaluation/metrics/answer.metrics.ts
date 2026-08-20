/**
 * 本文件计算 Answer 层的引用准确率、引用覆盖率、事实忠实度和无答案准确率，
 * 同时把禁止来源引用与高风险无依据事实作为硬失败。
 */
import {
  roundMetric,
  safeDivide,
  toSourceReferenceKey,
  uniqueSourceReferences,
} from './metric-math';
import type {
  AiAnswerEvaluationMetrics,
  AiAnswerEvaluationObservation,
} from '../types/ai-evaluation-run.types';
import type { AiGoldQueryDatasetV1 } from '../types/ai-gold-query.types';

/** 聚合固定模型回答在完整 Gold Query 数据集上的指标。 */
export function calculateAnswerMetrics(
  dataset: AiGoldQueryDatasetV1,
  observations: readonly AiAnswerEvaluationObservation[],
): AiAnswerEvaluationMetrics {
  const observationByQueryId = new Map(
    observations.map((observation) => [observation.queryId, observation]),
  );
  let citationCount = 0;
  let accurateCitationCount = 0;
  let majorClaimCount = 0;
  let citedMajorClaimCount = 0;
  let supportedMajorClaimCount = 0;
  let answerKeyPointCount = 0;
  let coveredAnswerKeyPointCount = 0;
  let correctNoAnswerCount = 0;
  let citationLeakSourceCount = 0;
  let unsupportedHighRiskFactCount = 0;
  const failedQueryIds = new Set<string>();

  for (const query of dataset.queries) {
    const observation = observationByQueryId.get(query.id);

    if (!observation) {
      failedQueryIds.add(query.id);
      continue;
    }

    const citedReferences = uniqueSourceReferences(
      observation.citedSourceReferences,
    );
    const relevantKeys = new Set(
      query.relevantSourceReferences.map(toSourceReferenceKey),
    );
    const forbiddenKeys = new Set(
      query.forbiddenSourceReferences.map(toSourceReferenceKey),
    );
    const accurateCitations = citedReferences.filter((reference) =>
      relevantKeys.has(toSourceReferenceKey(reference)),
    );
    const leakingCitations = citedReferences.filter((reference) =>
      forbiddenKeys.has(toSourceReferenceKey(reference)),
    );
    const refusalMatches = observation.refused === query.shouldRefuse;

    citationCount += citedReferences.length;
    accurateCitationCount += accurateCitations.length;
    citationLeakSourceCount += leakingCitations.length;
    majorClaimCount += observation.majorClaimCount;
    citedMajorClaimCount += observation.citedMajorClaimCount;
    supportedMajorClaimCount += observation.supportedMajorClaimCount;
    answerKeyPointCount += query.answerKeyPoints.length;
    coveredAnswerKeyPointCount += observation.coveredAnswerKeyPointCount;
    correctNoAnswerCount += refusalMatches ? 1 : 0;
    unsupportedHighRiskFactCount += observation.unsupportedHighRiskFactCount;

    const hasInaccurateCitation =
      accurateCitations.length !== citedReferences.length;
    const hasMissingClaimCitation =
      observation.citedMajorClaimCount < observation.majorClaimCount;
    const hasUnsupportedClaim =
      observation.supportedMajorClaimCount < observation.majorClaimCount;
    const hasMissingKeyPoint =
      observation.coveredAnswerKeyPointCount < query.answerKeyPoints.length;

    if (
      hasInaccurateCitation ||
      leakingCitations.length > 0 ||
      hasMissingClaimCitation ||
      hasUnsupportedClaim ||
      hasMissingKeyPoint ||
      !refusalMatches ||
      observation.unsupportedHighRiskFactCount > 0
    ) {
      failedQueryIds.add(query.id);
    }
  }

  return {
    queryCount: dataset.queries.length,
    citationAccuracy: roundMetric(
      safeDivide(accurateCitationCount, citationCount),
    ),
    citationCoverage: roundMetric(
      safeDivide(citedMajorClaimCount, majorClaimCount),
    ),
    answerKeyPointCoverage: roundMetric(
      safeDivide(coveredAnswerKeyPointCount, answerKeyPointCount),
    ),
    majorFactFaithfulness: roundMetric(
      safeDivide(supportedMajorClaimCount, majorClaimCount),
    ),
    noAnswerAccuracy: roundMetric(
      safeDivide(correctNoAnswerCount, dataset.queries.length, 0),
    ),
    citationLeakSourceCount,
    unsupportedHighRiskFactCount,
    failedQueryIds: [...failedQueryIds].sort(),
  };
}
