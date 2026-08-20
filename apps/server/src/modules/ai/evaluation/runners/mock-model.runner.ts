/**
 * 本文件使用 AI SDK V4 Mock 模型生成固定回答和向量探针，
 * 验证无真实模型费用时的回答解析、Token 记录和重复运行确定性。
 */
import type {
  AiAnswerEvaluationObservation,
  AiEvaluationToolName,
  AiSystemEvaluationObservation,
} from '../types/ai-evaluation-run.types';
import type {
  AiGoldQueryDatasetV1,
  AiGoldQueryForbiddenSourceReference,
  AiGoldQueryV1,
} from '../types/ai-gold-query.types';

/** Mock 语言模型固定输出的 JSON 结构。 */
type AiMockAnswerPayload = {
  /** 对应 Gold Query 标识。 */
  readonly queryId: string;
  /** 固定回答引用。 */
  readonly citedSourceReferences: readonly AiGoldQueryForbiddenSourceReference[];
  /** 覆盖答案要点数量。 */
  readonly coveredAnswerKeyPointCount: number;
  /** 主要结论数量。 */
  readonly majorClaimCount: number;
  /** 带引用的主要结论数量。 */
  readonly citedMajorClaimCount: number;
  /** 有允许证据支持的主要结论数量。 */
  readonly supportedMajorClaimCount: number;
  /** 是否拒答。 */
  readonly refused: boolean;
  /** 高风险无依据事实数量。 */
  readonly unsupportedHighRiskFactCount: number;
};

/** Mock 语言模型运行后返回的回答与系统观察值。 */
export type AiMockLanguageEvaluationResult = {
  /** 50 条固定回答观察值。 */
  readonly answerObservations: readonly AiAnswerEvaluationObservation[];
  /** 50 条固定系统观察值。 */
  readonly systemObservations: readonly AiSystemEvaluationObservation[];
  /** Mock 语言模型实际调用次数。 */
  readonly languageModelCallCount: number;
};

/** Mock 向量模型探针结果。 */
export type AiMockEmbeddingProbeResult = {
  /** 返回的固定向量数量。 */
  readonly vectorCount: number;
  /** Mock 向量模型实际调用次数。 */
  readonly embeddingModelCallCount: number;
};

/** 判断未知值是否为普通对象。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 判断未知值是否为允许解析的来源引用。 */
function isSourceReference(
  value: unknown,
): value is AiGoldQueryForbiddenSourceReference {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sourceType === 'string' && typeof value.sourceId === 'number'
  );
}

/** 根据 Gold Query 创建固定且完全符合评测合同的 Mock 回答。 */
function createMockAnswerPayload(query: AiGoldQueryV1): AiMockAnswerPayload {
  const majorClaimCount =
    query.shouldRefuse && query.relevantSourceReferences.length === 0
      ? 0
      : query.answerKeyPoints.length;

  return {
    queryId: query.id,
    citedSourceReferences: query.relevantSourceReferences,
    coveredAnswerKeyPointCount: query.answerKeyPoints.length,
    majorClaimCount,
    citedMajorClaimCount: majorClaimCount,
    supportedMajorClaimCount: majorClaimCount,
    refused: query.shouldRefuse,
    unsupportedHighRiskFactCount: 0,
  };
}

/** 将固定 JSON 文本严格解析为回答层观察值。 */
function parseMockAnswerObservation(
  text: string,
): AiAnswerEvaluationObservation {
  const payload: unknown = JSON.parse(text);

  if (
    !isRecord(payload) ||
    typeof payload.queryId !== 'string' ||
    !Array.isArray(payload.citedSourceReferences) ||
    !payload.citedSourceReferences.every(isSourceReference) ||
    typeof payload.coveredAnswerKeyPointCount !== 'number' ||
    typeof payload.majorClaimCount !== 'number' ||
    typeof payload.citedMajorClaimCount !== 'number' ||
    typeof payload.supportedMajorClaimCount !== 'number' ||
    typeof payload.refused !== 'boolean' ||
    typeof payload.unsupportedHighRiskFactCount !== 'number'
  ) {
    throw new Error('Mock 语言模型返回了不符合回答评测合同的 JSON。');
  }

  return {
    queryId: payload.queryId,
    citedSourceReferences: payload.citedSourceReferences,
    coveredAnswerKeyPointCount: payload.coveredAnswerKeyPointCount,
    majorClaimCount: payload.majorClaimCount,
    citedMajorClaimCount: payload.citedMajorClaimCount,
    supportedMajorClaimCount: payload.supportedMajorClaimCount,
    refused: payload.refused,
    unsupportedHighRiskFactCount: payload.unsupportedHighRiskFactCount,
  };
}

/** 根据授权与无答案标注确定系统层期望工具。 */
function getExpectedTool(query: AiGoldQueryV1): AiEvaluationToolName {
  if (query.expectedAccess === 'denied') {
    return 'authorize';
  }

  return query.shouldRefuse ? 'refuse' : 'retrieve_decision_process';
}

/** 使用 MockLanguageModelV4 为全部 Gold Query 生成固定观察值。 */
export async function runMockLanguageEvaluation(
  dataset: AiGoldQueryDatasetV1,
): Promise<AiMockLanguageEvaluationResult> {
  const { generateText } = await import('ai');
  const { MockLanguageModelV4 } = await import('ai/test');
  let queryIndex = 0;
  const model = new MockLanguageModelV4({
    provider: 'nextnest-evaluation',
    modelId: 'mock-language-model-v4-stage-zero',
    doGenerate: () => {
      const query = dataset.queries[queryIndex];

      if (!query) {
        throw new Error('Mock 语言模型调用次数超过 Gold Query 数量。');
      }

      queryIndex += 1;
      return Promise.resolve({
        content: [
          {
            type: 'text',
            text: JSON.stringify(createMockAnswerPayload(query)),
          },
        ],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: {
            total: 12,
            noCache: 12,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 24,
            text: 24,
            reasoning: undefined,
          },
        },
        warnings: [],
      });
    },
  });
  const answerObservations: AiAnswerEvaluationObservation[] = [];
  const systemObservations: AiSystemEvaluationObservation[] = [];

  for (const [index, query] of dataset.queries.entries()) {
    const result = await generateText({
      model,
      prompt: query.id + '：' + query.question,
    });
    const expectedTool = getExpectedTool(query);

    answerObservations.push(parseMockAnswerObservation(result.text));
    systemObservations.push({
      queryId: query.id,
      selectedTool: expectedTool,
      expectedTool,
      latencyMs: 80 + (index % 25) * 3,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      costUsd: 0,
      cancellationRequested: index === dataset.queries.length - 2,
      cancellationHandled: true,
      degradationRequested: index === dataset.queries.length - 1,
      degradationHandled: true,
    });
  }

  return {
    answerObservations,
    systemObservations,
    languageModelCallCount: model.doGenerateCalls.length,
  };
}

/** 使用 MockEmbeddingModelV4 运行一次固定三文本向量探针。 */
export async function runMockEmbeddingProbe(): Promise<AiMockEmbeddingProbeResult> {
  const { embedMany } = await import('ai');
  const { MockEmbeddingModelV4 } = await import('ai/test');
  const model = new MockEmbeddingModelV4({
    provider: 'nextnest-evaluation',
    modelId: 'mock-embedding-model-v4-stage-zero',
    maxEmbeddingsPerCall: 3,
    doEmbed: ({ values }) =>
      Promise.resolve({
        embeddings: values.map((_value, index) => [1, index + 1, 0]),
        usage: { tokens: values.length * 2 },
        warnings: [],
      }),
  });
  const result = await embedMany({
    model,
    values: ['决策如何形成', '比较两个提案', '证据不足时拒答'],
  });

  return {
    vectorCount: result.embeddings.length,
    embeddingModelCallCount: model.doEmbedCalls.length,
  };
}
