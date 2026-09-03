/**
 * 本文件聚合第 0 阶段首版 50 条中文 Gold Query，
 * 保持分类数据可单独审查，同时提供统一且版本化的数据集入口。
 */
import { AI_PERMISSION_GOLD_QUERY_DATASET_V1 } from './ai-permission-gold-query.fixture';
import { AI_ADVERSARIAL_GOLD_QUERIES_V1 } from './gold-queries/adversarial-gold-query.fixture';
import { AI_COMPARISON_GOLD_QUERIES_V1 } from './gold-queries/comparison-gold-query.fixture';
import { AI_EXACT_FACT_GOLD_QUERIES_V1 } from './gold-queries/exact-fact-gold-query.fixture';
import { AI_NO_ANSWER_GOLD_QUERIES_V1 } from './gold-queries/no-answer-gold-query.fixture';
import { AI_SEMANTIC_GOLD_QUERIES_V1 } from './gold-queries/semantic-gold-query.fixture';
import { AI_TIMELINE_GOLD_QUERIES_V1 } from './gold-queries/timeline-gold-query.fixture';
import type { AiGoldQueryDatasetV1 } from '../types/ai-gold-query.types';

/** 第 0 阶段首版 50 条中文 Gold Query 数据集。 */
export const AI_STAGE_ZERO_GOLD_QUERY_DATASET_V1 = {
  datasetVersion: 'ai-stage-zero-gold-query-v1',
  queries: [
    ...AI_EXACT_FACT_GOLD_QUERIES_V1,
    ...AI_TIMELINE_GOLD_QUERIES_V1,
    ...AI_SEMANTIC_GOLD_QUERIES_V1,
    ...AI_COMPARISON_GOLD_QUERIES_V1,
    ...AI_NO_ANSWER_GOLD_QUERIES_V1,
    ...AI_PERMISSION_GOLD_QUERY_DATASET_V1.queries,
    ...AI_ADVERSARIAL_GOLD_QUERIES_V1,
  ],
} as const satisfies AiGoldQueryDatasetV1;
