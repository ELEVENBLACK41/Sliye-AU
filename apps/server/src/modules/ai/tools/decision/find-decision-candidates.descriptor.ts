/**
 * 本文件定义 `findDecisionCandidates` 工具向中心注册表声明的稳定描述。
 * 描述本身与具体实现解耦：Runtime 和模型只看到这份契约，
 * 真实查询逻辑在 `find-decision-candidates.service.ts` 中委托给 decisions 模块。
 */

import type { AiToolDescriptor } from '../../types/ai-tool-registry.types';

/** `findDecisionCandidates` 的中心工具注册表描述。 */
export const FIND_DECISION_CANDIDATES_DESCRIPTOR: AiToolDescriptor = {
  name: 'findDecisionCandidates',
  description:
    '按当前用户实时可访问范围查找可能匹配的决策候选，不读取决策详情、讨论正文或其他业务对象。',
  accessMode: 'READ',
  timeoutMs: 3_000,
  input: {
    description: '用户消息中提取的决策名称、别名或可见标识符。',
    fields: [
      {
        name: 'query',
        valueType: 'STRING',
        required: true,
        description: '待发现的决策名称、别名或可见标识符。',
      },
    ],
  },
  output: {
    description: '受当前用户权限过滤后的候选决策摘要。',
    fields: [
      {
        name: 'candidates',
        valueType: 'OBJECT',
        required: true,
        description:
          '受控数量（当前上限 5 条）的候选决策摘要数组，每项包含决策主键、标题、所属项目标题、状态和最近更新时间。',
      },
    ],
  },
};
