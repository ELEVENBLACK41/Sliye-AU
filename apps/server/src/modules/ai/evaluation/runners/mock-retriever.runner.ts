/**
 * 本文件生成第 0 阶段关键词、向量和混合检索的确定性模拟排序，
 * 只用于验证指标、权限门禁和报告结构，不代表生产检索实现或真实效果。
 */
import { AI_DECISION_PROCESS_FIXTURE_V1 } from '../fixtures/ai-decision-process.fixture';
import { AI_PERMISSION_FIXTURE_V1 } from '../fixtures/ai-permission.fixture';
import {
  toSourceReferenceKey,
  uniqueSourceReferences,
} from '../metrics/metric-math';
import { filterPermissionFixtureSources } from './permission-fixture-filter';
import type { AiDecisionProcessFixtureCase } from '../types/ai-decision-process-fixture.types';
import type {
  AiEvaluationRetrieverMode,
  AiRetrieverEvaluationObservation,
} from '../types/ai-evaluation-run.types';
import type {
  AiGoldQueryDatasetV1,
  AiGoldQueryForbiddenSourceReference,
  AiGoldQueryV1,
} from '../types/ai-gold-query.types';

/** 收集一个完整案例中可参与安全模拟排序的来源引用。 */
function collectCaseSourceReferences(
  fixtureCase: AiDecisionProcessFixtureCase,
): readonly AiGoldQueryForbiddenSourceReference[] {
  const safeDiscussionMessages = fixtureCase.discussionMessages.filter(
    (message) =>
      message.evidenceRiskLabel === null && message.deletedAt === null,
  );
  const evidenceSources = [
    ...safeDiscussionMessages,
    ...fixtureCase.proposals,
    ...fixtureCase.events,
    ...fixtureCase.voteRounds,
    ...fixtureCase.resolutions,
    ...fixtureCase.meetingRecords,
  ].filter((source) => source.deletedAt === null);

  return [
    {
      sourceType: fixtureCase.decision.sourceType,
      sourceId: fixtureCase.decision.sourceId,
    },
    ...evidenceSources.map((source) => ({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
    })),
  ];
}

/** 判断 Query 是否必须通过权限 Fixture 的候选集过滤。 */
function usesPermissionFixture(query: AiGoldQueryV1): boolean {
  return (
    query.category === 'permission' ||
    query.id === 'adversarial-private-area-bypass' ||
    query.id === 'adversarial-anonymous-ballot-bypass'
  );
}

/** 返回与 Query 决策相同案例中的安全干扰来源。 */
function collectSafeDistractors(
  query: AiGoldQueryV1,
): readonly AiGoldQueryForbiddenSourceReference[] {
  const fixtureCase = AI_DECISION_PROCESS_FIXTURE_V1.cases.find(
    (candidate) =>
      candidate.decision.sourceId === query.requestScope.decisionId,
  );

  if (!fixtureCase) {
    return [];
  }

  const excludedKeys = new Set(
    [...query.relevantSourceReferences, ...query.forbiddenSourceReferences].map(
      toSourceReferenceKey,
    ),
  );

  return collectCaseSourceReferences(fixtureCase).filter(
    (reference) => !excludedKeys.has(toSourceReferenceKey(reference)),
  );
}

/** 根据模拟检索模式确定保留的相关来源，制造可重复的单路基线漏召回。 */
function selectModeRelevantSources(
  mode: AiEvaluationRetrieverMode,
  queryIndex: number,
  relevantSources: readonly AiGoldQueryForbiddenSourceReference[],
): readonly AiGoldQueryForbiddenSourceReference[] {
  if (mode === 'hybrid' || relevantSources.length === 0) {
    return relevantSources;
  }

  const shouldDropLastSource =
    mode === 'keyword' ? queryIndex % 5 === 0 : queryIndex % 7 === 0;

  return shouldDropLastSource ? relevantSources.slice(0, -1) : relevantSources;
}

/** 为单条 Query 生成经过权限裁剪的模拟排序。 */
function buildQueryRanking(
  query: AiGoldQueryV1,
  queryIndex: number,
  mode: AiEvaluationRetrieverMode,
): readonly AiGoldQueryForbiddenSourceReference[] {
  if (query.expectedAccess === 'denied' && !usesPermissionFixture(query)) {
    return [];
  }

  let allowedRelevantSources: readonly AiGoldQueryForbiddenSourceReference[] =
    query.relevantSourceReferences;

  if (usesPermissionFixture(query)) {
    allowedRelevantSources = filterPermissionFixtureSources(
      query,
      [...query.relevantSourceReferences, ...query.forbiddenSourceReferences],
      AI_PERMISSION_FIXTURE_V1,
    );
  }

  if (query.shouldRefuse && allowedRelevantSources.length === 0) {
    return [];
  }

  const selectedRelevantSources = selectModeRelevantSources(
    mode,
    queryIndex,
    allowedRelevantSources,
  );
  const distractors = collectSafeDistractors(query);
  const rankedSources =
    mode === 'hybrid'
      ? [...selectedRelevantSources, ...distractors]
      : [
          ...distractors.slice(0, mode === 'keyword' ? 1 : 2),
          ...selectedRelevantSources,
          ...distractors.slice(mode === 'keyword' ? 1 : 2),
        ];

  return uniqueSourceReferences(rankedSources).slice(0, 20);
}

/** 为完整数据集生成一个检索模式的确定性观察值。 */
export function buildMockRetrieverObservations(
  dataset: AiGoldQueryDatasetV1,
  mode: AiEvaluationRetrieverMode,
): readonly AiRetrieverEvaluationObservation[] {
  return dataset.queries.map((query, queryIndex) => ({
    queryId: query.id,
    retrievedSourceReferences: buildQueryRanking(query, queryIndex, mode),
  }));
}
