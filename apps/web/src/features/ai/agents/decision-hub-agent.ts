/**
 * 本文件创建第 2.4 阶段真实 Decision Agent，并显式限制工具和最大循环步数。
 */
import 'server-only';

import { isStepCount, ToolLoopAgent } from 'ai';

import type { ResolvedAiLanguageModel } from '../runtime/ai-model.server';
import { createDecisionAgentTools } from '../tools/registry';
import type { z } from 'zod';
import type { getDecisionContextToolContextSchema } from '../tools/decision/get-decision-context.tool';
import { DECISION_AGENT_INSTRUCTIONS } from './decision-agent-instructions';
import { prepareDecisionAgentStep, type DecisionAgentScopeRoute } from './decision-agent-scope-policy';

/** 使用已解析 Gateway 模型创建单 Run Agent。 */
export function createDecisionHubAgent(
  resolvedModel: ResolvedAiLanguageModel,
  toolContext: z.infer<typeof getDecisionContextToolContextSchema>,
  scopeRoute: DecisionAgentScopeRoute,
) {
  const { configuration } = resolvedModel;
  const allowedDecisionIds = toolContext.allowedDecisionIds.join(', ');

  return new ToolLoopAgent({
    id: 'nextnest-decision-hub-v1',
    model: resolvedModel.model,
    instructions: `${DECISION_AGENT_INSTRUCTIONS}\n\n当前 Run 已确认且可供工具选择的 Decision ID：${allowedDecisionIds}。这些 ID 只用于选择工具目标，不代表可以跳过工具读取。`,
    tools: createDecisionAgentTools(),
    toolsContext: { getDecisionContext: toolContext },
    stopWhen: isStepCount(8),
    maxOutputTokens: configuration.budget.maxOutputTokens,
    maxRetries: configuration.budget.maxRetries,
    timeout: {
      ...resolvedModel.timeout,
      toolMs: 8_000,
      tools: { getDecisionContextMs: 8_000 },
    },
    providerOptions: resolvedModel.providerOptions,
    prepareStep: ({ stepNumber }) => prepareDecisionAgentStep(scopeRoute, stepNumber),
  });
}
