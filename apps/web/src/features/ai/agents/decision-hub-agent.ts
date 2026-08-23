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

/** 使用已解析 Gateway 模型创建单 Run Agent。 */
export function createDecisionHubAgent(
  resolvedModel: ResolvedAiLanguageModel,
  toolContext: z.infer<typeof getDecisionContextToolContextSchema>,
) {
  const { configuration } = resolvedModel;

  return new ToolLoopAgent({
    id: 'nextnest-decision-hub-v1',
    model: resolvedModel.model,
    instructions: DECISION_AGENT_INSTRUCTIONS,
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
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0
        ? {
            toolChoice: {
              type: 'tool' as const,
              toolName: 'getDecisionContext' as const,
            },
          }
        : {},
  });
}
