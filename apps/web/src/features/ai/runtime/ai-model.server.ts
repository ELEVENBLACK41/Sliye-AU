/**
 * 本文件把模型注册表中的逻辑角色解析为 AI Gateway 的类型化模型实例。
 * 只有服务端 Route、Agent Runtime 或后台脚本可以通过这一层取得远程模型。
 */
import 'server-only';

import { gateway } from '@ai-sdk/gateway';
import type { EmbeddingModel, LanguageModel, RerankingModel } from 'ai';
import type { AiLanguageModelRole } from '@workspace/contracts/ai';

import {
  getAiEmbeddingModelConfiguration,
  getAiLanguageModelConfiguration,
  getAiRerankingModelConfiguration,
  type AiEmbeddingModelConfiguration,
  type AiLanguageModelConfiguration,
  type AiRerankingModelConfiguration,
} from './ai-model-registry.ts';
import {
  createAiGatewayProviderOptions,
  type AiGatewayProviderOptions,
  type AiGatewayRequestContext,
} from './ai-model-request-options.ts';

/** Route 或 Agent 调用语言模型时使用的完整解析结果。 */
export type ResolvedAiLanguageModel = {
  /** 经过环境覆盖和模型类型校验的角色配置。 */
  configuration: AiLanguageModelConfiguration;
  /** AI SDK 可直接传给 `streamText` 或 `generateText` 的语言模型。 */
  model: LanguageModel;
  /** 当前调用使用的 Gateway 路由、回退和脱敏归因参数。 */
  providerOptions: AiGatewayProviderOptions;
  /** AI SDK 原生超时配置。 */
  timeout: {
    /** 整次生成允许的最长时间。 */
    totalMs: number;
    /** 每个模型步骤允许的最长时间。 */
    stepMs: number;
    /** 相邻流式片段允许的最长等待时间。 */
    chunkMs: number;
  };
};

/** 后续索引阶段调用嵌入模型时使用的解析结果。 */
export type ResolvedAiEmbeddingModel = {
  /** 经过环境覆盖和模型类型校验的嵌入配置。 */
  configuration: AiEmbeddingModelConfiguration;
  /** AI SDK 可直接传给 `embed` 或 `embedMany` 的嵌入模型。 */
  model: EmbeddingModel;
};

/** 后续混合检索阶段调用重排模型时使用的解析结果。 */
export type ResolvedAiRerankingModel = {
  /** 经过环境覆盖和模型类型校验的重排配置。 */
  configuration: AiRerankingModelConfiguration;
  /** AI SDK 可直接传给 `rerank` 的重排模型。 */
  model: RerankingModel;
};

/** 将一个语言模型角色解析为 Gateway 模型和请求级执行设置。 */
export function resolveAiLanguageModel(
  role: AiLanguageModelRole,
  context: AiGatewayRequestContext,
): ResolvedAiLanguageModel {
  const configuration = getAiLanguageModelConfiguration(role);

  return {
    configuration,
    model: gateway(configuration.primary.modelId),
    providerOptions: createAiGatewayProviderOptions(configuration, context),
    timeout: {
      totalMs: configuration.budget.totalMs,
      stepMs: configuration.budget.stepMs,
      chunkMs: configuration.budget.chunkMs,
    },
  };
}

/** 解析固定维度的嵌入角色；第一阶段只建立能力，不发起实际嵌入请求。 */
export function resolveAiEmbeddingModel(): ResolvedAiEmbeddingModel {
  const configuration = getAiEmbeddingModelConfiguration();

  return {
    configuration,
    model: gateway.embeddingModel(configuration.primary.modelId),
  };
}

/** 解析多语言重排角色；第一阶段只建立能力，不发起实际重排请求。 */
export function resolveAiRerankingModel(): ResolvedAiRerankingModel {
  const configuration = getAiRerankingModelConfiguration();

  return {
    configuration,
    model: gateway.rerankingModel(configuration.primary.modelId),
  };
}
