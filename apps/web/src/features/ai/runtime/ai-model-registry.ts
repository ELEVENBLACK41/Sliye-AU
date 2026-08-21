/**
 * 本文件集中维护 AI 模型档案、逻辑角色预算、环境覆盖规则与价格快照。
 * 这里只保存可测试的纯配置，不创建供应商客户端，也不包含业务 Prompt。
 */

import type {
  AiEmbeddingModelRole,
  AiLanguageModelRole,
  AiModelRole,
  AiRerankingModelRole,
} from '@workspace/contracts/ai';

/** AI Gateway 模型目录和价格的本次人工核对时间。 */
const AI_MODEL_CATALOG_CAPTURED_AT = '2026-08-21';

/** 一份按每百万 Token 计价的静态价格快照。 */
export type AiTokenPriceSnapshot = {
  /** 价格信息来源。 */
  source: 'AI_GATEWAY_MODEL_API';
  /** 获取价格信息的日期。 */
  capturedAt: string;
  /** 每百万输入 Token 的美元价格；目录未提供时为 `null`。 */
  inputUsdPerMillionTokens: number | null;
  /** 每百万输出 Token 的美元价格；非生成模型或目录未提供时为 `null`。 */
  outputUsdPerMillionTokens: number | null;
  /** 每百万缓存读取 Token 的美元价格；不支持或目录未提供时为 `null`。 */
  cacheReadUsdPerMillionTokens: number | null;
  /** 价格信息无法直接换算时的说明。 */
  note?: string;
};

/** 语言模型经过验证后登记的能力和供应商边界。 */
export type AiLanguageModelProfile = {
  /** 区分语言、嵌入和重排模型的类型标记。 */
  kind: 'language';
  /** AI Gateway 使用的稳定模型标识。 */
  modelId: string;
  /** 当前目录公布的上下文窗口。 */
  contextWindowTokens: number;
  /** 当前目录公布的供应商最大输出 Token。 */
  providerMaxOutputTokens: number;
  /** 是否支持工具调用。 */
  supportsTools: boolean;
  /** 是否可通过 AI SDK 结构化输出能力使用。 */
  supportsStructuredOutput: boolean;
  /** 静态价格快照，仅用于估算和审计，不替代 Gateway 账单。 */
  pricing: AiTokenPriceSnapshot;
};

/** 嵌入模型经过验证后登记的维度与价格边界。 */
export type AiEmbeddingModelProfile = {
  /** 区分语言、嵌入和重排模型的类型标记。 */
  kind: 'embedding';
  /** AI Gateway 使用的稳定模型标识。 */
  modelId: string;
  /** 当前项目固定使用的向量维度。 */
  dimensions: number;
  /** 静态价格快照，仅用于估算和审计，不替代 Gateway 账单。 */
  pricing: AiTokenPriceSnapshot;
};

/** 重排模型经过验证后登记的能力与价格边界。 */
export type AiRerankingModelProfile = {
  /** 区分语言、嵌入和重排模型的类型标记。 */
  kind: 'reranking';
  /** AI Gateway 使用的稳定模型标识。 */
  modelId: string;
  /** 当前模型是否支持中文等多语言内容。 */
  supportsMultilingual: boolean;
  /** 静态价格快照；Gateway 未提供可换算价格时明确保留空值。 */
  pricing: AiTokenPriceSnapshot;
};

/** 模型目录支持的全部远程模型档案。 */
export type AiRemoteModelProfile = AiLanguageModelProfile | AiEmbeddingModelProfile | AiRerankingModelProfile;

/** 语言模型角色执行一次调用时使用的硬预算。 */
export type AiLanguageModelBudget = {
  /** 整次生成允许的最长时间。 */
  totalMs: number;
  /** 每次语言模型步骤允许的最长时间。 */
  stepMs: number;
  /** 流式响应相邻片段之间允许的最长等待时间。 */
  chunkMs: number;
  /** 单次生成允许的最大输出 Token。 */
  maxOutputTokens: number;
  /** AI SDK 对同一请求进行网络重试的最大次数。 */
  maxRetries: number;
};

/** 已解析的语言模型角色配置。 */
export type AiLanguageModelConfiguration = {
  /** 调用方请求的逻辑模型角色。 */
  role: AiLanguageModelRole;
  /** 当前角色实际选中的主模型档案。 */
  primary: AiLanguageModelProfile;
  /** 主模型失败时由 Gateway 按顺序尝试的模型档案。 */
  fallbacks: readonly AiLanguageModelProfile[];
  /** 当前角色的超时、输出和重试硬上限。 */
  budget: AiLanguageModelBudget;
};

/** 已解析的嵌入模型角色配置。 */
export type AiEmbeddingModelConfiguration = {
  /** 固定为嵌入角色。 */
  role: AiEmbeddingModelRole;
  /** 当前角色实际选中的嵌入模型档案。 */
  primary: AiEmbeddingModelProfile;
  /** 嵌入调用总超时。 */
  timeoutMs: number;
  /** 嵌入调用最大网络重试次数。 */
  maxRetries: number;
};

/** 已解析的重排模型角色配置。 */
export type AiRerankingModelConfiguration = {
  /** 固定为重排角色。 */
  role: AiRerankingModelRole;
  /** 当前角色实际选中的重排模型档案。 */
  primary: AiRerankingModelProfile;
  /** 重排调用总超时。 */
  timeoutMs: number;
  /** 重排调用最大网络重试次数。 */
  maxRetries: number;
};

/** 模型注册表发现未知模型或模型类型不匹配时抛出的配置错误。 */
export class AiModelConfigurationError extends Error {
  /** 创建一条不会包含密钥或正文的模型配置错误。 */
  constructor(message: string) {
    super(message);
    this.name = 'AiModelConfigurationError';
  }
}

/** AI Gateway 当前已核对的模型档案。 */
export const AI_REMOTE_MODEL_CATALOG: Readonly<Record<string, AiRemoteModelProfile>> = {
  'openai/gpt-5.4-nano': {
    kind: 'language',
    modelId: 'openai/gpt-5.4-nano',
    contextWindowTokens: 400_000,
    providerMaxOutputTokens: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    pricing: createTokenPriceSnapshot(0.2, 1.25, 0.02),
  },
  'openai/gpt-5.4-mini': {
    kind: 'language',
    modelId: 'openai/gpt-5.4-mini',
    contextWindowTokens: 400_000,
    providerMaxOutputTokens: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    pricing: createTokenPriceSnapshot(0.75, 4.5, 0.075),
  },
  'openai/gpt-5.4': {
    kind: 'language',
    modelId: 'openai/gpt-5.4',
    contextWindowTokens: 1_050_000,
    providerMaxOutputTokens: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    pricing: createTokenPriceSnapshot(2.5, 15, 0.25),
  },
  'anthropic/claude-sonnet-4.6': {
    kind: 'language',
    modelId: 'anthropic/claude-sonnet-4.6',
    contextWindowTokens: 1_000_000,
    providerMaxOutputTokens: 128_000,
    supportsTools: true,
    supportsStructuredOutput: true,
    pricing: createTokenPriceSnapshot(3, 15, 0.3),
  },
  'openai/text-embedding-3-small': {
    kind: 'embedding',
    modelId: 'openai/text-embedding-3-small',
    dimensions: 1_536,
    pricing: createTokenPriceSnapshot(0.02, null, null),
  },
  'cohere/rerank-v4-fast': {
    kind: 'reranking',
    modelId: 'cohere/rerank-v4-fast',
    supportsMultilingual: true,
    pricing: {
      ...createTokenPriceSnapshot(null, null, null),
      note: 'AI Gateway Model API 当前未提供可直接换算的重排价格，不能按 0 美元估算。',
    },
  },
};

/** 语言模型角色的默认档案、环境覆盖入口和执行预算。 */
const AI_LANGUAGE_ROLE_POLICIES: Record<
  AiLanguageModelRole,
  {
    envName: string;
    defaultModelId: string;
    fallbackModelIds: readonly string[];
    budget: AiLanguageModelBudget;
  }
> = {
  standard: {
    envName: 'AI_MODEL_STANDARD_ID',
    defaultModelId: 'openai/gpt-5.4-nano',
    fallbackModelIds: ['openai/gpt-5.4-mini'],
    budget: {
      totalMs: 45_000,
      stepMs: 20_000,
      chunkMs: 12_000,
      maxOutputTokens: 2_048,
      maxRetries: 1,
    },
  },
  deepReview: {
    envName: 'AI_MODEL_DEEP_REVIEW_ID',
    defaultModelId: 'openai/gpt-5.4',
    fallbackModelIds: ['anthropic/claude-sonnet-4.6'],
    budget: {
      totalMs: 120_000,
      stepMs: 60_000,
      chunkMs: 20_000,
      maxOutputTokens: 8_192,
      maxRetries: 1,
    },
  },
};

/** 获取当前确定性路由器的版本信息。 */
export function getAiRouterConfiguration(): { role: 'router'; implementationVersion: string } {
  return {
    role: 'router',
    implementationVersion: 'deterministic-rules-v1',
  };
}

/** 根据逻辑角色和服务端环境变量解析语言模型配置。 */
export function getAiLanguageModelConfiguration(
  role: AiLanguageModelRole,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AiLanguageModelConfiguration {
  const policy = AI_LANGUAGE_ROLE_POLICIES[role];
  const primary = getRemoteModelProfile(environment[policy.envName]?.trim() || policy.defaultModelId, 'language');
  const fallbacks = policy.fallbackModelIds
    .filter((modelId) => modelId !== primary.modelId)
    .map((modelId) => getRemoteModelProfile(modelId, 'language'));

  return {
    role,
    primary,
    fallbacks,
    budget: policy.budget,
  };
}

/** 解析固定维度的嵌入模型配置，拒绝语言或重排模型覆盖。 */
export function getAiEmbeddingModelConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AiEmbeddingModelConfiguration {
  const modelId = environment.AI_MODEL_EMBEDDING_ID?.trim() || 'openai/text-embedding-3-small';

  return {
    role: 'embedding',
    primary: getRemoteModelProfile(modelId, 'embedding'),
    timeoutMs: 30_000,
    maxRetries: 1,
  };
}

/** 解析多语言候选重排模型配置，拒绝语言或嵌入模型覆盖。 */
export function getAiRerankingModelConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AiRerankingModelConfiguration {
  const modelId = environment.AI_MODEL_RERANKER_ID?.trim() || 'cohere/rerank-v4-fast';

  return {
    role: 'reranker',
    primary: getRemoteModelProfile(modelId, 'reranking'),
    timeoutMs: 30_000,
    maxRetries: 1,
  };
}

/** 返回五种角色的脱敏配置快照，供测试、诊断和后续运行记录复用。 */
export function getAiModelRegistrySnapshot(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Readonly<Record<AiModelRole, object>> {
  return {
    router: getAiRouterConfiguration(),
    standard: getAiLanguageModelConfiguration('standard', environment),
    deepReview: getAiLanguageModelConfiguration('deepReview', environment),
    embedding: getAiEmbeddingModelConfiguration(environment),
    reranker: getAiRerankingModelConfiguration(environment),
  };
}

/** 根据实际模型 ID 和 Token 用量估算本次语言模型调用费用。 */
export function estimateAiLanguageModelCostUsd(
  modelId: string,
  usage: { inputTokens?: number; outputTokens?: number },
): number | null {
  const profile = AI_REMOTE_MODEL_CATALOG[modelId];

  if (!profile || profile.kind !== 'language') {
    return null;
  }

  const inputPrice = profile.pricing.inputUsdPerMillionTokens;
  const outputPrice = profile.pricing.outputUsdPerMillionTokens;

  if (inputPrice === null || outputPrice === null) {
    return null;
  }

  return ((usage.inputTokens ?? 0) * inputPrice + (usage.outputTokens ?? 0) * outputPrice) / 1_000_000;
}

/** 创建单位统一且包含来源日期的 Token 价格快照。 */
function createTokenPriceSnapshot(
  inputUsdPerMillionTokens: number | null,
  outputUsdPerMillionTokens: number | null,
  cacheReadUsdPerMillionTokens: number | null,
): AiTokenPriceSnapshot {
  return {
    source: 'AI_GATEWAY_MODEL_API',
    capturedAt: AI_MODEL_CATALOG_CAPTURED_AT,
    inputUsdPerMillionTokens,
    outputUsdPerMillionTokens,
    cacheReadUsdPerMillionTokens,
  };
}

/** 从受控目录读取指定类型的模型，避免环境变量绕过能力和维度校验。 */
function getRemoteModelProfile<KIND extends AiRemoteModelProfile['kind']>(
  modelId: string,
  expectedKind: KIND,
): Extract<AiRemoteModelProfile, { kind: KIND }> {
  const profile = AI_REMOTE_MODEL_CATALOG[modelId];

  if (!profile) {
    throw new AiModelConfigurationError(`模型 ${modelId} 尚未登记在 NextNest AI 模型注册表中。`);
  }

  if (profile.kind !== expectedKind) {
    throw new AiModelConfigurationError(`模型 ${modelId} 的类型为 ${profile.kind}，不能用于 ${expectedKind} 角色。`);
  }

  return profile as Extract<AiRemoteModelProfile, { kind: KIND }>;
}
