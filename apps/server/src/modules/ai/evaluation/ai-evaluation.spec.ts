/**
 * 本文件验证第 0 阶段 Gold Query、Fixture、权限门禁、三层指标和报告确定性，
 * 全部测试只使用脱敏静态数据与 AI SDK V4 Mock 模型。
 */
import { AI_DECISION_PROCESS_FIXTURE_V1 } from './fixtures/ai-decision-process.fixture';
import { AI_PERMISSION_GOLD_QUERY_DATASET_V1 } from './fixtures/ai-permission-gold-query.fixture';
import { AI_PERMISSION_FIXTURE_V1 } from './fixtures/ai-permission.fixture';
import { AI_STAGE_TWO_AGENT_SCOPE_GOLD_QUERY_DATASET_V1 } from './fixtures/ai-stage-two-agent-scope-gold-query.fixture';
import { AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1 } from './fixtures/ai-stage-zero-gold-query.fixture';
import { calculateAnswerMetrics } from './metrics/answer.metrics';
import { toSourceReferenceKey } from './metrics/metric-math';
import { calculateRetrieverMetrics } from './metrics/retriever.metrics';
import {
  serializeStageZeroReportJson,
  serializeStageZeroReportMarkdown,
} from './runners/evaluation-report.serializer';
import { filterPermissionFixtureSources } from './runners/permission-fixture-filter';
import { createStageZeroEvaluationReport } from './runners/stage-zero-evaluation.runner';
import { runMockLanguageEvaluation } from './runners/mock-model.runner';
import type { AiGoldQueryForbiddenSourceReference } from './types/ai-gold-query.types';

/** 收集决策过程 Fixture 中全部可定位来源键。 */
function collectDecisionProcessSourceKeys(): ReadonlySet<string> {
  const references: AiGoldQueryForbiddenSourceReference[] = [];

  for (const fixtureCase of AI_DECISION_PROCESS_FIXTURE_V1.cases) {
    references.push({
      sourceType: fixtureCase.decision.sourceType,
      sourceId: fixtureCase.decision.sourceId,
    });

    for (const source of [
      ...fixtureCase.discussionMessages,
      ...fixtureCase.proposals,
      ...fixtureCase.events,
      ...fixtureCase.voteRounds,
      ...fixtureCase.resolutions,
      ...fixtureCase.meetingRecords,
    ]) {
      references.push({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
      });
    }
  }

  return new Set(references.map(toSourceReferenceKey));
}

describe('AI 第 0 阶段确定性评测', () => {
  it('首版数据集应恰好包含 50 条唯一中文 Gold Query 并覆盖七类问题', () => {
    const ids = AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1.queries.map(
      (query) => query.id,
    );
    const categoryCounts = AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1.queries.reduce<
      Record<string, number>
    >(
      (counts, query) => ({
        ...counts,
        [query.category]: (counts[query.category] ?? 0) + 1,
      }),
      {},
    );

    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect(categoryCounts).toEqual({
      exact_fact: 8,
      timeline: 8,
      semantic: 8,
      comparison: 7,
      negative_or_no_answer: 7,
      permission: 5,
      adversarial: 7,
    });
    expect(
      AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1.queries.every((query) =>
        /[\u3400-\u9fff]/u.test(query.question),
      ),
    ).toBe(true);
  });

  it('所有相关和禁止来源都必须能在脱敏 Fixture 中定位', () => {
    const availableKeys = new Set(collectDecisionProcessSourceKeys());

    for (const source of AI_PERMISSION_FIXTURE_V1.sources) {
      availableKeys.add(toSourceReferenceKey(source));
    }

    for (const query of AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1.queries) {
      for (const reference of [
        ...query.relevantSourceReferences,
        ...query.forbiddenSourceReferences,
      ]) {
        expect(availableKeys.has(toSourceReferenceKey(reference))).toBe(true);
      }
    }
  });

  it('权限 Fixture 必须在召回前过滤私有区、删除、跨项目和匿名单票诱饵', () => {
    for (const query of AI_PERMISSION_GOLD_QUERY_DATASET_V1.queries) {
      const filteredSources = filterPermissionFixtureSources(
        query,
        [...query.relevantSourceReferences, ...query.forbiddenSourceReferences],
        AI_PERMISSION_FIXTURE_V1,
      );

      expect(filteredSources.map(toSourceReferenceKey)).toEqual(
        query.relevantSourceReferences.map(toSourceReferenceKey),
      );
    }
  });

  it('2.4 固定评测集应覆盖四类离题、标题精确差异和 Thread 范围切换', async () => {
    const dataset = AI_STAGE_TWO_AGENT_SCOPE_GOLD_QUERY_DATASET_V1;
    const ids = dataset.queries.map((query) => query.id);
    const evaluation = await runMockLanguageEvaluation(dataset);
    const metrics = calculateAnswerMetrics(
      dataset,
      evaluation.answerObservations,
    );

    expect(dataset.datasetVersion).toBe(
      'ai-stage-two-agent-scope-gold-query-v1',
    );
    expect(ids).toEqual([
      'stage-two-off-topic-react-tutorial',
      'stage-two-off-topic-weather',
      'stage-two-off-topic-general-writing',
      'stage-two-off-topic-code-generation',
      'stage-two-title-exact-match',
      'stage-two-title-punctuation-mismatch',
      'stage-two-thread-scope-switch-injection',
    ]);
    expect(evaluation.languageModelCallCount).toBe(dataset.queries.length);
    expect(metrics.noAnswerAccuracy).toBe(1);
    expect(metrics.citationLeakSourceCount).toBe(0);
    expect(metrics.failedQueryIds).toEqual([]);
  });

  it('Retriever 指标必须把拒绝请求中的任何召回立即计为权限泄漏', () => {
    const deniedQuery = AI_PERMISSION_GOLD_QUERY_DATASET_V1.queries.find(
      (query) => query.id === 'private-area-non-member-denied',
    );

    expect(deniedQuery).toBeDefined();
    if (!deniedQuery) {
      return;
    }

    const metrics = calculateRetrieverMetrics(
      {
        datasetVersion: 'intentional-leak-v1',
        queries: [deniedQuery],
      },
      [
        {
          queryId: deniedQuery.id,
          retrievedSourceReferences: deniedQuery.forbiddenSourceReferences,
        },
      ],
    );

    expect(metrics.permissionLeakSourceCount).toBe(1);
    expect(metrics.failedQueryIds).toEqual([deniedQuery.id]);
  });

  it('完整 Mock 评测重复运行应生成完全相同的报告并通过全部门禁', async () => {
    const firstReport = await createStageZeroEvaluationReport();
    const secondReport = await createStageZeroEvaluationReport();
    const hybridRun = firstReport.retrieverRuns.find(
      (run) => run.mode === 'hybrid',
    );
    const keywordRun = firstReport.retrieverRuns.find(
      (run) => run.mode === 'keyword',
    );
    const vectorRun = firstReport.retrieverRuns.find(
      (run) => run.mode === 'vector',
    );

    expect(serializeStageZeroReportJson(firstReport)).toBe(
      serializeStageZeroReportJson(secondReport),
    );
    expect(serializeStageZeroReportMarkdown(firstReport)).toBe(
      serializeStageZeroReportMarkdown(secondReport),
    );
    expect(firstReport.gates.every((gate) => gate.passed)).toBe(true);
    expect(firstReport.answerMetrics.queryCount).toBe(50);
    expect(firstReport.systemMetrics.queryCount).toBe(50);
    expect(hybridRun?.metrics.permissionLeakSourceCount).toBe(0);
    expect(hybridRun?.metrics.recallAt20).toBe(1);
    expect(keywordRun?.metrics.recallAt20).toBeLessThan(
      hybridRun?.metrics.recallAt20 ?? 0,
    );
    expect(vectorRun?.metrics.recallAt20).toBeLessThan(
      hybridRun?.metrics.recallAt20 ?? 0,
    );
    expect(firstReport.failedSamples.length).toBeGreaterThan(0);
  });
});
