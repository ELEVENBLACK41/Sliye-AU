/**
 * 本文件集中注册 Agent 可见工具及不可由模型修改的风险、权限和预算元数据。
 */
import 'server-only';

import type { AiToolDefinitionMetadata } from '@workspace/contracts/ai';

import { getDecisionContextTool } from './decision/get-decision-context.tool';

/** 第 2.4 阶段唯一真实工具的治理配置。 */
export const GET_DECISION_CONTEXT_TOOL_METADATA = {
  name: 'getDecisionContext',
  riskLevel: 'READ_ONLY',
  requiredPermissions: ['ai:chat:use', 'decision:read'],
  maxOutputCharacters: 8_000,
  timeoutMs: 8_000,
  maxRetries: 0,
  allowParallel: false,
} as const satisfies AiToolDefinitionMetadata;

/** 创建 Decision Agent 当前允许使用的中心工具集合。 */
export function createDecisionAgentTools() {
  return {
    getDecisionContext: getDecisionContextTool,
  };
}
