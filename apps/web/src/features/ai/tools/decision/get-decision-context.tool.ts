/**
 * 本文件把 NestJS 的 `getDecisionContext` 中心工具适配为 AI SDK 静态工具。
 * 输入由 AI SDK + Zod 校验，候选唯一性和实时权限仍由 NestJS 强制执行。
 */

import { tool, type ToolExecutionOptions } from 'ai';
import { z } from 'zod';

import {
  NEXTNEST_WORKSPACE_TOOL_CONTEXT_SCHEMA,
  toNextNestWorkspaceToolResult,
  type NextNestWorkspaceToolContext,
  type NextNestWorkspaceToolInvoker,
  type NextNestWorkspaceToolResult,
} from './decision-agent-tool-context.ts';

/** `getDecisionContext` 的 AI SDK 输入类型。 */
export type GetDecisionContextToolInput = z.infer<typeof GET_DECISION_CONTEXT_INPUT_SCHEMA>;

/** 读取决策上下文的窄输入 Schema；主键必须为正整数。 */
const GET_DECISION_CONTEXT_INPUT_SCHEMA = z.object({
  decisionId: z.number().int().positive().describe('必须来自本次候选发现结果的决策主键。'),
});

/** 构造官方 `getDecisionContext` 工具，并接收服务端装配入口绑定的执行器。 */
export function createGetDecisionContextTool(
  invokeTool: NextNestWorkspaceToolInvoker,
) {
  return tool({
    description:
      '读取一项决策的结构化上下文。仅在 findDecisionCandidates 返回恰好一个候选后使用；不要对用户输入的、猜测的或未经发现的 decisionId 调用。',
    inputSchema: GET_DECISION_CONTEXT_INPUT_SCHEMA,
    contextSchema: NEXTNEST_WORKSPACE_TOOL_CONTEXT_SCHEMA,
    execute: (input, options) => executeGetDecisionContextTool(input, options, invokeTool),
  });
}

/** 执行决策上下文工具，并把调用凭据限制在当前工具自己的上下文中。 */
async function executeGetDecisionContextTool(
  input: GetDecisionContextToolInput,
  options: ToolExecutionOptions<NextNestWorkspaceToolContext>,
  invokeTool: NextNestWorkspaceToolInvoker,
): Promise<NextNestWorkspaceToolResult> {
  const result = await invokeTool({
    runId: options.context.runId,
    executionLeaseId: options.context.executionLeaseId,
    providerToolCallId: options.toolCallId,
    toolName: 'getDecisionContext',
    toolInput: input,
  });

  return toNextNestWorkspaceToolResult(result);
}

/** `getDecisionContext` 工具实例的类型，供 Agent UI Message 类型推导复用。 */
export type GetDecisionContextTool = ReturnType<typeof createGetDecisionContextTool>;
