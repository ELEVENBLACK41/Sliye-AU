/**
 * 本文件定义第 0 阶段三层 AI 评测的观察值、指标和版本化报告合同，
 * 仅用于离线确定性评测，不作为生产 Agent 或接口契约。
 */
import type { AiGoldQueryForbiddenSourceReference } from './ai-gold-query.types';

/** 第 0 阶段需要分别记录的检索配置。 */
export type AiEvaluationRetrieverMode =
  /** 关键词检索基线。 */
  | 'keyword'
  /** 向量检索基线。 */
  | 'vector'
  /** 关键词与向量融合检索基线。 */
  | 'hybrid';

/** 系统层可观察的最小工具选择。 */
export type AiEvaluationToolName =
  /** 只执行授权并拒绝继续读取。 */
  | 'authorize'
  /** 读取已授权的决策过程证据。 */
  | 'retrieve_decision_process'
  /** 在授权后因无答案或越界请求拒答。 */
  | 'refuse';

/** 单条 Query 的检索层观察值。 */
export type AiRetrieverEvaluationObservation = {
  /** 对应 Gold Query 的稳定标识。 */
  readonly queryId: string;
  /** 按相关性从高到低排列的检索来源。 */
  readonly retrievedSourceReferences: readonly AiGoldQueryForbiddenSourceReference[];
};

/** 单条 Query 的回答层观察值。 */
export type AiAnswerEvaluationObservation = {
  /** 对应 Gold Query 的稳定标识。 */
  readonly queryId: string;
  /** 回答实际引用的来源。 */
  readonly citedSourceReferences: readonly AiGoldQueryForbiddenSourceReference[];
  /** 回答覆盖的 Gold Query 答案要点数量。 */
  readonly coveredAnswerKeyPointCount: number;
  /** 回答中需要证据支持的主要结论数量。 */
  readonly majorClaimCount: number;
  /** 已附带引用的主要结论数量。 */
  readonly citedMajorClaimCount: number;
  /** 可由允许证据直接支持的主要结论数量。 */
  readonly supportedMajorClaimCount: number;
  /** 回答是否对全部或受限部分内容执行了拒答。 */
  readonly refused: boolean;
  /** 无证据生成的高风险精确事实数量。 */
  readonly unsupportedHighRiskFactCount: number;
};

/** 单条 Query 的系统层观察值。 */
export type AiSystemEvaluationObservation = {
  /** 对应 Gold Query 的稳定标识。 */
  readonly queryId: string;
  /** 系统实际选择的工具路径。 */
  readonly selectedTool: AiEvaluationToolName;
  /** 根据评测合同期望选择的工具路径。 */
  readonly expectedTool: AiEvaluationToolName;
  /** 端到端模拟延迟，单位为毫秒。 */
  readonly latencyMs: number;
  /** 模拟语言模型输入 Token 数。 */
  readonly inputTokens: number;
  /** 模拟语言模型输出 Token 数。 */
  readonly outputTokens: number;
  /** 本次模拟运行成本；Mock 模型固定为 0 美元。 */
  readonly costUsd: number;
  /** 是否触发取消场景。 */
  readonly cancellationRequested: boolean;
  /** 触发取消时系统是否正确停止。 */
  readonly cancellationHandled: boolean;
  /** 是否触发降级场景。 */
  readonly degradationRequested: boolean;
  /** 触发降级时系统是否返回受控结果。 */
  readonly degradationHandled: boolean;
};

/** 单个检索配置的聚合指标。 */
export type AiRetrieverEvaluationMetrics = {
  /** 本次参与计算的 Query 总数。 */
  readonly queryCount: number;
  /** 具有至少一个相关来源、实际进入召回指标的 Query 数。 */
  readonly relevantQueryCount: number;
  /** 前 5 个结果的平均召回率。 */
  readonly recallAt5: number;
  /** 前 10 个结果的平均召回率。 */
  readonly recallAt10: number;
  /** 前 20 个结果的平均召回率。 */
  readonly recallAt20: number;
  /** 平均倒数排名。 */
  readonly mrr: number;
  /** 前 20 个结果的平均归一化折损累计增益。 */
  readonly ndcgAt20: number;
  /** 越权、已禁止或拒绝请求中仍被召回的来源数量。 */
  readonly permissionLeakSourceCount: number;
  /** 未达到完整 Recall@20 或发生权限泄漏的 Query 标识。 */
  readonly failedQueryIds: readonly string[];
};

/** 回答层聚合指标。 */
export type AiAnswerEvaluationMetrics = {
  /** 本次参与计算的 Query 总数。 */
  readonly queryCount: number;
  /** 引用中实际属于相关允许来源的比例。 */
  readonly citationAccuracy: number;
  /** 主要结论中带有引用的比例。 */
  readonly citationCoverage: number;
  /** Gold Query 答案要点被覆盖的比例。 */
  readonly answerKeyPointCoverage: number;
  /** 主要结论中有允许证据支持的比例。 */
  readonly majorFactFaithfulness: number;
  /** 应拒答与实际拒答判断一致的比例。 */
  readonly noAnswerAccuracy: number;
  /** 引用了禁止来源的数量。 */
  readonly citationLeakSourceCount: number;
  /** 无证据生成的高风险精确事实总数。 */
  readonly unsupportedHighRiskFactCount: number;
  /** 任一回答门禁失败的 Query 标识。 */
  readonly failedQueryIds: readonly string[];
};

/** 系统层聚合指标。 */
export type AiSystemEvaluationMetrics = {
  /** 本次参与计算的 Query 总数。 */
  readonly queryCount: number;
  /** 工具选择与评测合同一致的比例。 */
  readonly toolSelectionAccuracy: number;
  /** 模拟端到端延迟的中位数，单位为毫秒。 */
  readonly latencyP50Ms: number;
  /** 模拟端到端延迟的第 95 百分位，单位为毫秒。 */
  readonly latencyP95Ms: number;
  /** 模拟语言模型输入 Token 总数。 */
  readonly totalInputTokens: number;
  /** 模拟语言模型输出 Token 总数。 */
  readonly totalOutputTokens: number;
  /** 模拟运行总成本，单位为美元。 */
  readonly totalCostUsd: number;
  /** 触发取消的场景中被正确处理的比例。 */
  readonly cancellationSuccessRate: number;
  /** 触发降级的场景中被正确处理的比例。 */
  readonly degradationSuccessRate: number;
  /** 任一系统层门禁失败的 Query 标识。 */
  readonly failedQueryIds: readonly string[];
};

/** 单个检索模式及其版本化配置和指标。 */
export type AiRetrieverEvaluationRun = {
  /** 当前运行采用的检索模式。 */
  readonly mode: AiEvaluationRetrieverMode;
  /** 可复现当前模拟排序规则的配置版本。 */
  readonly configurationVersion: string;
  /** 当前检索模式的聚合指标。 */
  readonly metrics: AiRetrieverEvaluationMetrics;
};

/** 第 0 阶段单项门禁的判定结果。 */
export type AiEvaluationGateResult = {
  /** 稳定门禁标识。 */
  readonly id: string;
  /** 面向报告阅读者的中文门禁说明。 */
  readonly description: string;
  /** 当前计算值。 */
  readonly actual: number;
  /** 门禁要求的比较方式。 */
  readonly operator: 'eq' | 'gte';
  /** 当前门禁阈值。 */
  readonly threshold: number;
  /** 当前计算值是否满足门禁。 */
  readonly passed: boolean;
};

/** 报告中一条可定位的失败样本。 */
export type AiEvaluationFailedSample = {
  /** 失败发生的评测层。 */
  readonly layer: 'retriever' | 'answer' | 'system';
  /** 对应 Gold Query 的稳定标识。 */
  readonly queryId: string;
  /** 失败原因的中文说明。 */
  readonly reason: string;
};

/** 第 0 阶段版本化评测报告 V1。 */
export type AiStageZeroEvaluationReportV1 = {
  /** 报告结构版本。 */
  readonly reportVersion: 'ai-stage-zero-report-v1';
  /** 为保证确定性而固定到评测版本的 ISO 8601 时间。 */
  readonly generatedAt: string;
  /** 明确该报告来自脱敏 Fixture 和 Mock 模型，不代表生产效果。 */
  readonly executionMode: 'deterministic_mock';
  /** 本次运行使用的 Gold Query 数据集版本。 */
  readonly datasetVersion: string;
  /** 本次运行使用的决策过程 Fixture 版本。 */
  readonly fixtureVersion: string;
  /** 本次运行使用的 AI SDK 版本。 */
  readonly aiSdkVersion: string;
  /** 固定语言模型标识。 */
  readonly languageModelVersion: string;
  /** 固定向量模型标识。 */
  readonly embeddingModelVersion: string;
  /** 关键词、向量和混合三种模拟检索配置。 */
  readonly retrieverRuns: readonly AiRetrieverEvaluationRun[];
  /** 固定模型输出的回答层指标。 */
  readonly answerMetrics: AiAnswerEvaluationMetrics;
  /** 固定模型输出的系统层指标。 */
  readonly systemMetrics: AiSystemEvaluationMetrics;
  /** 第 0 阶段全部初始门禁。 */
  readonly gates: readonly AiEvaluationGateResult[];
  /** 未通过的具体 Query；全部通过时为空数组。 */
  readonly failedSamples: readonly AiEvaluationFailedSample[];
  /** 解释当前报告边界和后续使用方式的说明。 */
  readonly notes: readonly string[];
};
