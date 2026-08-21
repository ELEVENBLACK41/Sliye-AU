/**
 * 本文件生成 AI Gateway 的请求级路由、回退和成本归因选项。
 * 标签只包含内部标识和固定分类，不接收用户正文、标题或其他敏感内容。
 */

import type { GatewayLanguageModelOptions } from '@ai-sdk/gateway';
import type { AiLanguageModelConfiguration } from './ai-model-registry.ts';

/** 构造 Gateway 请求归因信息所需的安全上下文。 */
export type AiGatewayRequestContext = {
  /** 当前认证用户的内部主键。 */
  userId: number | string;
  /** 可选的项目内部主键；当前全局测试对话可以省略。 */
  projectId?: number | string;
  /** 固定业务功能标签，不能传入用户生成文本。 */
  feature?: 'chat' | 'decision-agent' | 'gateway-smoke';
};

/** AI SDK `providerOptions` 中 Gateway 使用的类型安全结构。 */
export type AiGatewayProviderOptions = {
  /** AI Gateway 的路由和归因参数。 */
  gateway: {
    /** 主模型失败后按顺序尝试的受控模型 ID。 */
    models: string[];
    /** Gateway 成本和限流归因使用的内部用户标识。 */
    user: string;
    /** 可选的项目级额度归因实体。 */
    quotaEntityId?: string;
    /** 只包含固定分类的低基数标签。 */
    tags: string[];
  };
};

/** 为一次语言模型调用创建脱敏 Gateway 路由与统计参数。 */
export function createAiGatewayProviderOptions(
  configuration: AiLanguageModelConfiguration,
  context: AiGatewayRequestContext,
  environmentName: string | undefined = process.env.NODE_ENV,
): AiGatewayProviderOptions {
  const gatewayOptions = {
    models: configuration.fallbacks.map((profile) => profile.modelId),
    user: String(context.userId),
    ...(context.projectId === undefined ? {} : { quotaEntityId: String(context.projectId) }),
    tags: [
      'app:nextnest-web',
      `feature:${context.feature ?? 'chat'}`,
      `role:${configuration.role}`,
      `env:${normalizeEnvironmentName(environmentName)}`,
    ],
  } satisfies GatewayLanguageModelOptions;

  return {
    gateway: gatewayOptions,
  };
}

/** 将任意 NODE_ENV 值收敛为不会形成无限标签基数的固定集合。 */
function normalizeEnvironmentName(
  environmentName: string | undefined,
): 'development' | 'test' | 'production' | 'unknown' {
  if (environmentName === 'development' || environmentName === 'test' || environmentName === 'production') {
    return environmentName;
  }

  return 'unknown';
}
