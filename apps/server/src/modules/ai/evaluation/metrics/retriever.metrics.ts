/**
 * 本文件计算 Retriever 层的 Recall@K、MRR、nDCG 和权限泄漏指标，
 * 输入仅为 Gold Query 与已排序观察值，不绑定任何生产检索实现。
 */
import {
  roundMetric,
  safeDivide,
  toSourceReferenceKey,
  uniqueSourceReferences,
} from './metric-math';
import type {
  AiRetrieverEvaluationMetrics,
  AiRetrieverEvaluationObservation,
} from '../types/ai-evaluation-run.types';
import type {
  AiGoldQueryDatasetV1,
  AiGoldQueryV1,
} from '../types/ai-gold-query.types';

/** 计算单条 Query 在前 K 个结果中的召回率。 */
function calculateQueryRecall(
  query: AiGoldQueryV1,
  retrievedKeys: readonly string[],
  limit: number,
): number {
  const relevantKeys = new Set(
    query.relevantSourceReferences.map(toSourceReferenceKey),
  );
  const hitCount = retrievedKeys
    .slice(0, limit)
    .filter((key) => relevantKeys.has(key)).length;

  return safeDivide(hitCount, relevantKeys.size, 0);
}

/** 计算单条 Query 第一条相关结果的倒数排名。 */
function calculateReciprocalRank(
  query: AiGoldQueryV1,
  retrievedKeys: readonly string[],
): number {
  const relevantKeys = new Set(
    query.relevantSourceReferences.map(toSourceReferenceKey),
  );
  const firstRelevantIndex = retrievedKeys.findIndex((key) =>
    relevantKeys.has(key),
  );

  return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
}

/** 计算单条 Query 在前 K 个结果中的二元相关性 nDCG。 */
function calculateNdcg(
  query: AiGoldQueryV1,
  retrievedKeys: readonly string[],
  limit: number,
): number {
  const relevantKeys = new Set(
    query.relevantSourceReferences.map(toSourceReferenceKey),
  );
  const actualDcg = retrievedKeys.slice(0, limit).reduce((sum, key, index) => {
    return relevantKeys.has(key) ? sum + 1 / Math.log2(index + 2) : sum;
  }, 0);
  const idealHitCount = Math.min(relevantKeys.size, limit);
  let idealDcg = 0;

  for (let index = 0; index < idealHitCount; index += 1) {
    idealDcg += 1 / Math.log2(index + 2);
  }

  return safeDivide(actualDcg, idealDcg, 0);
}

/** 返回当前 Query 中属于拒绝范围或显式禁止范围的召回来源键。 */
function collectLeakKeys(
  query: AiGoldQueryV1,
  retrievedKeys: readonly string[],
): readonly string[] {
  if (query.expectedAccess === 'denied') {
    return retrievedKeys;
  }

  const forbiddenKeys = new Set(
    query.forbiddenSourceReferences.map(toSourceReferenceKey),
  );
  return retrievedKeys.filter((key) => forbiddenKeys.has(key));
}

/** 聚合一个检索配置在完整 Gold Query 数据集上的指标。 */
export function calculateRetrieverMetrics(
  dataset: AiGoldQueryDatasetV1,
  observations: readonly AiRetrieverEvaluationObservation[],
): AiRetrieverEvaluationMetrics {
  const observationByQueryId = new Map(
    observations.map((observation) => [observation.queryId, observation]),
  );
  const relevantQueries = dataset.queries.filter(
    (query) =>
      query.expectedAccess === 'allowed' &&
      query.relevantSourceReferences.length > 0,
  );
  let recallAt5Sum = 0;
  let recallAt10Sum = 0;
  let recallAt20Sum = 0;
  let reciprocalRankSum = 0;
  let ndcgAt20Sum = 0;
  let permissionLeakSourceCount = 0;
  const failedQueryIds = new Set<string>();

  for (const query of dataset.queries) {
    const observation = observationByQueryId.get(query.id);
    const retrievedReferences = uniqueSourceReferences(
      observation?.retrievedSourceReferences ?? [],
    );
    const retrievedKeys = retrievedReferences.map(toSourceReferenceKey);
    const leakKeys = collectLeakKeys(query, retrievedKeys);

    permissionLeakSourceCount += leakKeys.length;
    if (leakKeys.length > 0) {
      failedQueryIds.add(query.id);
    }

    if (
      query.expectedAccess === 'allowed' &&
      query.relevantSourceReferences.length > 0
    ) {
      const recallAt5 = calculateQueryRecall(query, retrievedKeys, 5);
      const recallAt10 = calculateQueryRecall(query, retrievedKeys, 10);
      const recallAt20 = calculateQueryRecall(query, retrievedKeys, 20);

      recallAt5Sum += recallAt5;
      recallAt10Sum += recallAt10;
      recallAt20Sum += recallAt20;
      reciprocalRankSum += calculateReciprocalRank(query, retrievedKeys);
      ndcgAt20Sum += calculateNdcg(query, retrievedKeys, 20);

      if (recallAt20 < 1) {
        failedQueryIds.add(query.id);
      }
    }
  }

  return {
    queryCount: dataset.queries.length,
    relevantQueryCount: relevantQueries.length,
    recallAt5: roundMetric(safeDivide(recallAt5Sum, relevantQueries.length, 0)),
    recallAt10: roundMetric(
      safeDivide(recallAt10Sum, relevantQueries.length, 0),
    ),
    recallAt20: roundMetric(
      safeDivide(recallAt20Sum, relevantQueries.length, 0),
    ),
    mrr: roundMetric(safeDivide(reciprocalRankSum, relevantQueries.length, 0)),
    ndcgAt20: roundMetric(safeDivide(ndcgAt20Sum, relevantQueries.length, 0)),
    permissionLeakSourceCount,
    failedQueryIds: [...failedQueryIds].sort(),
  };
}
