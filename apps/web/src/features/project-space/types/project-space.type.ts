/**
 * 本文件定义项目空间线框阶段使用的页面展示类型，后续接入接口时可逐步替换为 contracts 契约。
 */
import type {
  DecisionDetail,
  DecisionEventTimelineItem,
  DecisionProposal,
  DecisionResolution,
  DecisionVoteRound,
} from '@workspace/contracts/decisions';

/** 项目空间左侧列表中的项目摘要。 */
export type ProjectSpaceSummary = {
  /** 项目稳定标识。 */
  id: string;
  /** 项目名称。 */
  title: string;
  /** 项目当前状态文案。 */
  status: string;
  /** 项目下已创建的决策数量。 */
  decisionCount: number;
};

/** 项目空间中央区域可切换的一级业务模块。 */
export type ProjectSectionKey = 'discussion' | 'decisions' | 'meetings';

/** 新版项目创建表单可选择的启用部门。 */
export type ProjectCreateDepartmentOption = {
  /** 部门数据库主键。 */
  id: number;
  /** 带组织层级缩进的部门显示名称。 */
  label: string;
};

/** 新版项目空间单项决策工作台一次加载的完整业务数据。 */
export type ProjectDecisionWorkspaceData = {
  /** 当前选中的决策详情与参与者。 */
  decision: DecisionDetail;
  /** 当前决策的全部提案。 */
  proposals: DecisionProposal[];
  /** 当前决策的全部投票轮次。 */
  voteRounds: DecisionVoteRound[];
  /** 当前决策已经形成的正式决议。 */
  resolutions: DecisionResolution[];
  /** 当前决策的稳定事件时间线。 */
  events: DecisionEventTimelineItem[];
};

/** 新版项目空间针对当前用户计算后的决策操作能力。 */
export type ProjectDecisionCapabilities = {
  /** 当前用户是否拥有创建决策的系统权限。 */
  canCreate: boolean;
  /** 当前用户是否拥有更新参与决策的系统权限。 */
  canUpdate: boolean;
};

/** D3 决策树中的节点类型。 */
export type DecisionTreeNodeType = 'project' | 'area' | 'decision' | 'proposal' | 'vote' | 'resolution' | 'abandoned';

/** D3 决策树路径最终形成的业务结果。 */
export type DecisionTreeRouteStatus =
  | 'neutral'
  | 'unvoted'
  | 'resolved'
  | 'rejected'
  | 'abandoned'
  | 'superseded'
  | 'revoked';

/** D3 决策树中的项目、决策、提案或正式决议节点。 */
export type DecisionTreeNode = {
  /** 节点稳定标识，并与回放事件保持一致。 */
  id: string;
  /** 驱动当前实体首次出现在回放画布上的事件标识；省略时使用节点标识匹配。 */
  appearanceEventId?: string;
  /** 节点业务类型。 */
  type: DecisionTreeNodeType;
  /** 节点主要名称。 */
  title: string;
  /** 节点辅助说明。 */
  subtitle: string;
  /** 节点所在路径最终形成正式决议、被废弃或保持中性旁支。 */
  routeStatus: DecisionTreeRouteStatus;
  /** 当前路径形成正式决议或被废弃时对应的回放事件标识。 */
  completionEventId?: string;
  /** 提案投票结果正式确定时对应的回放事件标识。 */
  statusEventId?: string;
  /** 点击节点时优先展示的最终业务结果事件标识。 */
  detailEventId?: string;
  /** 当前节点的下级业务节点。 */
  children?: DecisionTreeNode[];
};

/** 决策过程回放中的时间节点。 */
export type DecisionReplayEvent = {
  /** 节点稳定标识。 */
  id: string;
  /** 节点在完整决策过程中的顺序。 */
  sequence: number;
  /** 当前事件属于项目级决策还是某个小组讨论分区。 */
  scopeLabel?: string;
  /** 节点所属的决策阶段。 */
  phase: '决策' | '提案' | '投票' | '决议' | '废弃';
  /** 事件在模拟时间线中的可读发生时间。 */
  timeLabel: string;
  /** 节点事件名称。 */
  label: string;
  /** 节点发生时的业务说明。 */
  summary: string;
  /** 发起节点动作的成员或协作空间。 */
  actor: string;
  /** 节点沉淀的过程证据。 */
  evidence: string;
};

/** 决策过程回放支持的播放倍速。 */
export type DecisionReplaySpeed = 1 | 1.5 | 2;
