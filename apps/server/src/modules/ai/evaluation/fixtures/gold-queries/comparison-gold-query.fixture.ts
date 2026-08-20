/**
 * 本文件提供第 0 阶段的 7 条比较类 Gold Query，
 * 覆盖供应商、会议节奏和办公室方案的差异。
 */
import type { AiGoldQueryV1 } from '../../types/ai-gold-query.types';

/** 比较类 Gold Query。 */
export const AI_COMPARISON_GOLD_QUERIES_V1 = [
  {
    id: 'comparison-vendor-overview',
    category: 'comparison',
    question: '星舟云和云桥科技两个提案的主要差异是什么？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5001,
      scopeLevel: 'area',
      areaId: 3001,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'proposal', sourceId: 5101 },
      { sourceType: 'proposal', sourceId: 5102 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '星舟云首年 32 万元并采用分阶段迁移。',
      '云桥科技订阅费 34 万元且私有部署费用未计入。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'comparison-vendor-cost',
    category: 'comparison',
    question: '两个客服平台方案在已知成本上相差多少？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5001,
      scopeLevel: 'area',
      areaId: 3001,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4001 },
      { sourceType: 'proposal', sourceId: 5101 },
      { sourceType: 'proposal', sourceId: 5102 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '星舟云已知首年成本为 32 万元。',
      '云桥科技仅订阅费为 34 万元，至少高 2 万元。',
      '云桥私有部署费用未知。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'comparison-vendor-risks',
    category: 'comparison',
    question: '两个供应商方案分别面临什么主要风险？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5001,
      scopeLevel: 'area',
      areaId: 3001,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4101 },
      { sourceType: 'discussion_message', sourceId: 4102 },
      { sourceType: 'proposal', sourceId: 5101 },
      { sourceType: 'proposal', sourceId: 5102 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '星舟云主要风险是迁移中断，因此需要分阶段。',
      '云桥科技主要风险是数据区域不合规和额外私有部署成本。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'comparison-meeting-overview',
    category: 'comparison',
    question: '每周短会和双周长会两个提案的侧重点有什么不同？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5002,
      scopeLevel: 'area',
      areaId: 3002,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'proposal', sourceId: 5121 },
      { sourceType: 'proposal', sourceId: 5122 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '每周短会强调快速暴露阻塞并限制时长。',
      '双周长会强调集中准备和减少上下文切换。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'comparison-meeting-frequency-duration',
    category: 'comparison',
    question: '两个研发例会提案在频率和时长上如何比较？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5002,
      scopeLevel: 'area',
      areaId: 3002,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'proposal', sourceId: 5121 },
      { sourceType: 'proposal', sourceId: 5122 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '方案一每周一次、45 分钟。',
      '方案二每两周一次、90 分钟。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'comparison-office-overview',
    category: 'comparison',
    question: '续租与搬迁两个办公室方案的核心差异是什么？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5004,
      scopeLevel: 'project',
      areaId: null,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'proposal', sourceId: 5141 },
      { sourceType: 'proposal', sourceId: 5142 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '续租年度租金 48 万元并有三个月装修免租期。',
      '搬迁首年成本 62 万元且会增加通勤时间。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'comparison-office-cost-commute',
    category: 'comparison',
    question: '从成本和通勤两个角度比较续租与搬迁方案。',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5004,
      scopeLevel: 'project',
      areaId: null,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4401 },
      { sourceType: 'discussion_message', sourceId: 4402 },
      { sourceType: 'proposal', sourceId: 5141 },
      { sourceType: 'proposal', sourceId: 5142 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '续租成本更低并维持现有通勤。',
      '搬迁首年成本高 14 万元，平均单程通勤预计增加 25 分钟。',
    ],
    shouldRefuse: false,
  },
] as const satisfies readonly AiGoldQueryV1[];
