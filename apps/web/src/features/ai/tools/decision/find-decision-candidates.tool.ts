/**
 * 本文件把 NestJS 的 `findDecisionCandidates` 中心工具适配为 AI SDK 静态工具。
 * 输入由 AI SDK + Zod 校验，实际查询、权限过滤和来源登记仍由 NestJS 完成。
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

/** `findDecisionCandidates` 的 AI SDK 输入类型。 */
export type FindDecisionCandidatesToolInput = z.infer<typeof FIND_DECISION_CANDIDATES_INPUT_SCHEMA>;

/** 查找决策候选的窄输入 Schema；用户正文只作为查询词，不允许模型传入主键。 */
const FIND_DECISION_CANDIDATES_INPUT_SCHEMA = z.object({
  query: z.string().trim().min(1).describe('决策名称、别名或用户可见标识符。'),
});

/** 构造官方 `findDecisionCandidates` 工具，并接收服务端装配入口绑定的执行器。 */
export function createFindDecisionCandidatesTool(
  invokeTool: NextNestWorkspaceToolInvoker,
) {
  return tool({
    description:
      '查找当前用户有权访问的决策候选。仅在用户提到决策名称、别名或可见标识符且需要消歧时使用；不要用于读取决策详情，也不要猜测决策主键。',
    inputSchema: FIND_DECISION_CANDIDATES_INPUT_SCHEMA,
    contextSchema: NEXTNEST_WORKSPACE_TOOL_CONTEXT_SCHEMA,
    execute: (input, options) => executeFindDecisionCandidatesTool(input, options, invokeTool),
  });
}

/** 执行候选发现工具，并把调用凭据限制在当前工具自己的上下文中。 */
async function executeFindDecisionCandidatesTool(
  input: FindDecisionCandidatesToolInput,
  options: ToolExecutionOptions<NextNestWorkspaceToolContext>,
  invokeTool: NextNestWorkspaceToolInvoker,
): Promise<NextNestWorkspaceToolResult> {
  const result = await invokeTool({
    runId: options.context.runId,
    executionLeaseId: options.context.executionLeaseId,
    providerToolCallId: options.toolCallId,
    toolName: 'findDecisionCandidates',
    toolInput: input,
  });

  return toNextNestWorkspaceToolResult(result);
}

/** `findDecisionCandidates` 工具实例的类型，供 Agent UI Message 类型推导复用。 */
export type FindDecisionCandidatesTool = ReturnType<typeof createFindDecisionCandidatesTool>;
