/**
 * 本文件提供第 0 阶段的 8 条语义类 Gold Query，
 * 覆盖成本、迁移、安全、会议效率和通勤等观点理解。
 */
import type { AiGoldQueryV1 } from '../../types/ai-gold-query.types';

/** 语义类 Gold Query。 */
export const AI_SEMANTIC_GOLD_QUERIES_V1 = [
  {
    id: 'semantic-vendor-cost-concern',
    category: 'semantic',
    question: '谁提出了客服平台成本方面的约束，具体担忧是什么？',
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
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '财务代表甲提出年度预算上限为 32 万元。',
      '云桥科技仅订阅费就达到 34 万元。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'semantic-vendor-migration-risk',
    category: 'semantic',
    question: '运维为什么主张分阶段迁移客服平台？',
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
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '运维担心一次性迁移导致服务中断。',
      '因此建议两阶段迁移并预留四周。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'semantic-vendor-security-risk',
    category: 'semantic',
    question: '安全评审对云桥科技提出了什么问题？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5001,
      scopeLevel: 'area',
      areaId: 3001,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4102 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '默认数据区域不满足国内存储要求。',
      '需要另购私有部署才能解决。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'semantic-vendor-analytics-value',
    category: 'semantic',
    question: '产品团队如何评价云桥科技的分析能力？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5001,
      scopeLevel: 'area',
      areaId: 3001,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4103 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '产品团队认为分析看板更成熟。',
      '但确认该能力不是本次上线硬性条件。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'semantic-meeting-current-pain',
    category: 'semantic',
    question: '研发团队为什么想调整当前例会？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5002,
      scopeLevel: 'area',
      areaId: 3002,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4002 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '现有每周例会经常超过 90 分钟。',
      '同步内容重复并占用连续开发时间。',
    ],
    shouldRefuse: false,
  },
  {
    id: 'semantic-meeting-biweekly-rationale',
    category: 'semantic',
    question: '支持双周长会的主要理由是什么？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5002,
      scopeLevel: 'area',
      areaId: 3002,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4202 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: ['可以集中准备。', '可以减少频繁会议造成的上下文切换。'],
    shouldRefuse: false,
  },
  {
    id: 'semantic-office-commute-concern',
    category: 'semantic',
    question: '员工对搬迁到创新中心的主要顾虑是什么？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5004,
      scopeLevel: 'project',
      areaId: null,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4402 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: ['搬迁后平均单程通勤时间预计增加 25 分钟。'],
    shouldRefuse: false,
  },
  {
    id: 'semantic-office-concession-impact',
    category: 'semantic',
    question: '三个月装修免租条件为什么会影响续租方案？',
    requestScope: {
      requesterId: 1001,
      projectId: 2001,
      decisionId: 5004,
      scopeLevel: 'project',
      areaId: null,
    },
    expectedAccess: 'allowed',
    relevantSourceReferences: [
      { sourceType: 'discussion_message', sourceId: 4403 },
      { sourceType: 'meeting_record', sourceId: 5441 },
    ],
    forbiddenSourceReferences: [],
    answerKeyPoints: [
      '该条件降低了续租方案的实际成本。',
      '它在投票前进入了方案比较。',
    ],
    shouldRefuse: false,
  },
] as const satisfies readonly AiGoldQueryV1[];
