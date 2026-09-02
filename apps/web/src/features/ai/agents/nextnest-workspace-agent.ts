/**
 * 本文件定义 NextNest Workspace Agent 的纯 AI SDK 7 核心。
 * 服务端模型解析和 NestJS 调用由同目录的 `.server.ts` 装配，便于用 Mock 验证官方 Agent 契约。
 */

import { isStepCount, ToolLoopAgent, type InferAgentUIMessage, type LanguageModel } from 'ai';

import { DECISION_HUB_AGENT_INSTRUCTIONS } from './decision-hub-agent.ts';
import { createFindDecisionCandidatesTool } from '../tools/decision/find-decision-candidates.tool.ts';
import { createGetDecisionContextTool } from '../tools/decision/get-decision-context.tool.ts';
import type { NextNestWorkspaceToolInvoker } from '../tools/decision/decision-agent-tool-context.ts';
import type { AiGatewayProviderOptions } from '../runtime/ai-model-request-options.ts';

/** 官方 Workspace Agent 的稳定标识。 */
export const NEXTNEST_WORKSPACE_AGENT_ID = 'nextnest-workspace-agent';

/** C1 Spike 允许的最大模型步骤数。 */
export const NEXTNEST_WORKSPACE_AGENT_MAX_STEPS = 8;

/** 官方 Agent 装配时需要的模型治理结果。 */
export type NextNestWorkspaceAgentModelSettings = {
  /** 通过模型注册表解析出的 AI SDK 语言模型。 */
  model: LanguageModel;
  /** 当前逻辑角色允许的最大输出 Token。 */
  maxOutputTokens: number;
  /** 当前逻辑角色允许的网络重试次数。 */
  maxRetries: number;
  /** AI Gateway 的路由、回退和脱敏归因参数。 */
  providerOptions: AiGatewayProviderOptions;
  /** 当前逻辑角色的 AI SDK 超时设置。 */
  timeout: {
    /** 整次生成允许的最长时间。 */
    totalMs: number;
    /** 每个模型步骤允许的最长时间。 */
    stepMs: number;
    /** 相邻流式片段允许的最长等待时间。 */
    chunkMs: number;
  };
};

/** 创建一次纯 Agent 核心所需的请求身份、Run 凭据和模型设置。 */
export type NextNestWorkspaceAgentCoreOptions = {
  /** 当前请求的内部关联标识。 */
  requestId: string;
  /** 当前认证用户的内部主键。 */
  userId: number | string;
  /** 当前 Agent Run 标识。 */
  runId: string;
  /** 当前执行器持有的租约标识。 */
  executionLeaseId: string;
  /** 由服务端模型注册表解析出的模型与预算。 */
  modelSettings: NextNestWorkspaceAgentModelSettings;
  /** 已绑定服务端执行边界的工具调用函数。 */
  invokeTool: NextNestWorkspaceToolInvoker;
};

/** Agent 共享的请求级运行上下文，不会自动进入模型 Prompt。 */
export type NextNestWorkspaceAgentRuntimeContext = {
  /** 当前请求的内部关联标识。 */
  requestId: string;
  /** 当前认证用户的内部主键。 */
  userId: number | string;
};

/** 创建带有官方 ToolLoopAgent、两个 Spike 工具和请求上下文的纯 Agent 核心。
 *  https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent ToolLoopAgent官方文档介绍
 *  通过多步骤使用工具（推理与行动循环）调用工具并对结果进行推理，知道达成目标或达到最大步骤数
 * 
 */
export function createNextNestWorkspaceAgentCore(options: NextNestWorkspaceAgentCoreOptions) {
  // 工具集合
  const tools = {
    findDecisionCandidates: createFindDecisionCandidatesTool(options.invokeTool),
    getDecisionContext: createGetDecisionContextTool(options.invokeTool),
  };

  return new ToolLoopAgent({
    id: NEXTNEST_WORKSPACE_AGENT_ID,
    model: options.modelSettings.model,
    instructions: DECISION_HUB_AGENT_INSTRUCTIONS,
    tools,
    stopWhen: isStepCount(NEXTNEST_WORKSPACE_AGENT_MAX_STEPS),//8
    maxOutputTokens: options.modelSettings.maxOutputTokens,// 最大吐出的token数
    maxRetries: options.modelSettings.maxRetries, // 失败请求的重试次数 默认2
    providerOptions: options.modelSettings.providerOptions,//额外的服务商专用配置
    timeout: options.modelSettings.timeout,
    runtimeContext: { //用户自定义的共享运行时上下文对象
      requestId: options.requestId,
      userId: options.userId,
    } satisfies NextNestWorkspaceAgentRuntimeContext,
    toolsContext: {//每个工具的上下文映射
      findDecisionCandidates: {
        runId: options.runId,
        executionLeaseId: options.executionLeaseId,
      },
      getDecisionContext: {
        runId: options.runId,
        executionLeaseId: options.executionLeaseId,
      },
    },
  });
}

/** 官方 Workspace Agent 实例类型，供服务端装配、Route 和测试声明复用。 */
export type NextNestWorkspaceAgent = ReturnType<typeof createNextNestWorkspaceAgentCore>;

/** 从官方 Agent 工具集合推导出的 UI Message 类型，供后续 useChat 接入复用。 */
export type NextNestWorkspaceAgentUIMessage = InferAgentUIMessage<NextNestWorkspaceAgent>;
