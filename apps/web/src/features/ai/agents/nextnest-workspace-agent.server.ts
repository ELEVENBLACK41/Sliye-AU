/**
 * 本文件是 NextNest Workspace Agent 的服务端装配入口。
 * 它只负责保护服务端依赖、解析模型注册表并绑定 NestJS 工具调用；Agent Loop 由纯核心交给 AI SDK。
 */

import 'server-only';

import type { LanguageModel } from 'ai';
import type { AiLanguageModelRole } from '@workspace/contracts/ai';

import {
  createNextNestWorkspaceAgentCore,
  type NextNestWorkspaceAgent,
  type NextNestWorkspaceAgentCoreOptions,
  type NextNestWorkspaceAgentModelSettings,
  type NextNestWorkspaceAgentRuntimeContext,
  type NextNestWorkspaceAgentUIMessage,
  NEXTNEST_WORKSPACE_AGENT_ID,
  NEXTNEST_WORKSPACE_AGENT_MAX_STEPS,
} from './nextnest-workspace-agent.ts';
import { invokeAiRuntimeTool } from '../runtime/ai-runtime-client.server.ts';
import { resolveAiLanguageModel } from '../runtime/ai-model.server.ts';
import type { NextNestWorkspaceToolInvoker } from '../tools/decision/decision-agent-tool-context.ts';

/** 创建一次官方 Agent 所需的请求级身份、Run 凭据和可选测试替身。 */
export type NextNestWorkspaceAgentOptions = {
  /** 当前请求的内部关联标识。 */
  requestId: string;
  /** 当前认证用户的内部主键。 */
  userId: number | string;
  /** 当前 Agent Run 标识。 */
  runId: string;
  /** 当前执行器持有的租约标识。 */
  executionLeaseId: string;
  /** 持久化 Run 指定的逻辑语言模型角色，默认使用 standard。 */
  modelRole?: AiLanguageModelRole;
  /** 仅供 Mock 测试注入的 AI SDK 语言模型；生产调用使用模型注册表。 */
  model?: LanguageModel;
  /** 仅供 Mock 测试替换 NestJS 工具调用的函数。 */
  invokeTool?: NextNestWorkspaceToolInvoker;
};

/** 创建服务端 Workspace Agent，并把模型和工具绑定到现有治理边界。 */
export function createNextNestWorkspaceAgent(options: NextNestWorkspaceAgentOptions) {
  const resolvedModel = resolveAiLanguageModel(options.modelRole ?? 'standard', {
    userId: options.userId,
    feature: 'decision-agent',
  });

  return createNextNestWorkspaceAgentCore({
    requestId: options.requestId,
    userId: options.userId,
    runId: options.runId,
    executionLeaseId: options.executionLeaseId,
    modelSettings: {
      model: options.model ?? resolvedModel.model,
      maxOutputTokens: resolvedModel.configuration.budget.maxOutputTokens,
      maxRetries: resolvedModel.configuration.budget.maxRetries,
      providerOptions: resolvedModel.providerOptions,
      timeout: resolvedModel.timeout,
    },
    invokeTool: options.invokeTool ?? invokeAiRuntimeTool,
  });
}

export {
  NEXTNEST_WORKSPACE_AGENT_ID,
  NEXTNEST_WORKSPACE_AGENT_MAX_STEPS,
};

export type {
  NextNestWorkspaceAgent,
  NextNestWorkspaceAgentCoreOptions,
  NextNestWorkspaceAgentModelSettings,
  NextNestWorkspaceAgentRuntimeContext,
  NextNestWorkspaceAgentUIMessage,
};
