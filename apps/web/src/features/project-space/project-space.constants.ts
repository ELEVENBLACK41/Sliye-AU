/**
 * 本文件集中维护项目空间线框阶段的静态展示数据，便于后续替换为服务端返回值。
 */
import type {
  DecisionBranch,
  DecisionReplayEvent,
  ProjectSpaceSummary,
} from './types/project-space.type';

/** 左侧项目列表的线框展示数据。 */
export const projectSpaceProjects: ProjectSpaceSummary[] = [
  { id: 'experience-redesign', title: '产品体验升级计划', status: '进行中', decisionCount: 4 },
  { id: 'brand-refresh', title: 'Q3 品牌焕新', status: '进行中', decisionCount: 3 },
  { id: 'mobile-performance', title: '移动端体验优化', status: '进行中', decisionCount: 2 },
  { id: 'community-co-build', title: '社区共建计划', status: '已关闭', decisionCount: 1 },
];

/** 中部决策关系画布的议题分支数据。 */
export const decisionBranches: DecisionBranch[] = [
  {
    id: 'registration-path',
    title: '注册路径调整',
    status: '讨论中',
    participantCount: 8,
    proposals: [
      { title: '提案 A', status: '8/10 已投', resolved: true },
      { title: '提案 B', status: '7 赞成 · 2 反对', resolved: true },
    ],
  },
  {
    id: 'invitation-system',
    title: '邀请机制优化',
    status: '讨论中',
    participantCount: 12,
    proposals: [
      { title: '提案 A', status: '6/10 已投', resolved: true },
      { title: '提案 B', status: '待投票' },
      { title: '提案 C', status: '待投票' },
    ],
  },
  {
    id: 'onboarding',
    title: '首访引导改版',
    status: '讨论中',
    participantCount: 6,
    proposals: [
      { title: '提案 A', status: '待投票' },
      { title: '提案 B', status: '待投票' },
    ],
  },
  {
    id: 'privacy',
    title: '隐私策略确认',
    status: '讨论中',
    participantCount: 6,
    proposals: [
      { title: '提案 A', status: '6/10 已投', resolved: true },
      { title: '提案 B', status: '5 赞成 · 3 反对', resolved: true },
    ],
  },
];

/** 底部过程回放时间轴的节点数据。 */
export const replayEvents: DecisionReplayEvent[] = [
  { date: '04.12', label: '项目启动' },
  { date: '04.18', label: '提出注册路径调整' },
  { date: '04.20', label: '提出邀请机制优化' },
  { date: '04.25', label: '提案 A 提交' },
  { date: '05.02', label: '投票轮次 1 开始' },
  { date: '05.10', label: '提案 A 正式决议', active: true },
  { date: '05.20', label: '提案 C 提交' },
  { date: '05.28', label: '隐私策略确认' },
];
