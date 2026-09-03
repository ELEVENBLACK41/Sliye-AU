/**
 * 本文件定义 `getDecisionContext` 工具向中心注册表声明的稳定描述。
 * 描述本身与具体实现解耦：Runtime 和模型只看到这份契约，
 * 真实查询逻辑在 `get-decision-context.service.ts` 中委托给 decisions 模块。
 */

import type { AiToolDescriptor } from '../../types/ai-tool-registry.types';

/** `getDecisionContext` 的中心工具注册表描述。 */
export const GET_DECISION_CONTEXT_DESCRIPTOR: AiToolDescriptor = {
  name: 'getDecisionContext',
  description:
    '读取一项决策的结构化上下文事实，只能使用 findDecisionCandidates 在本次对话中返回的候选决策主键；不接受凭空猜测的主键，也不返回讨论正文、会议转写或提案投票明细。',
  accessMode: 'READ',
  timeoutMs: 3_000,
  presentation: {
    displayName: '读取决策上下文',
  },
  governance: {
    riskLevel: 'L0',
    sourceTypes: ['DECISION', 'DECISION_RESOLUTION'],
    resultLimit: {
      maxChars: 4_000,
    },
    retryPolicy: {
      maxRetries: 0,
    },
    parallelPolicy: 'DENY',
  },
  input: {
    description: '本 Run 已发现候选中唯一命中的决策主键。',
    fields: [
      {
        name: 'decisionId',
        valueType: 'NUMBER',
        required: true,
        description:
          '待读取的决策主键，必须来自本次对话中 findDecisionCandidates 返回的候选。',
      },
    ],
  },
  discoveryRequirement: {
    discoveryToolName: 'findDecisionCandidates',
    targetInputField: 'decisionId',
    candidateListField: 'candidates',
    candidateIdentifierField: 'decisionId',
  },
  output: {
    description: '受当前用户权限保护的单项决策结构化上下文。',
    fields: [
      {
        name: 'decision',
        valueType: 'OBJECT',
        required: true,
        description:
          '决策的标题、描述摘要、状态、所属项目与分区、牵头部门、负责人、参与人数、提案/投票/决议计数、最新生效决议摘要和关键时间点。',
      },
    ],
  },
};
