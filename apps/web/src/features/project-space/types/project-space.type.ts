/**
 * 本文件定义项目空间线框阶段使用的页面展示类型，后续接入接口时可逐步替换为 contracts 契约。
 */

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

/** 决策关系画布中的一条决策分支。 */
export type DecisionBranch = {
  /** 分支稳定标识。 */
  id: string;
  /** 决策名称。 */
  title: string;
  /** 决策当前阶段。 */
  status: string;
  /** 参与决策的成员数量。 */
  participantCount: number;
  /** 决策包含的提案信息。 */
  proposals: DecisionProposal[];
};

/** 决策关系画布中的提案摘要。 */
export type DecisionProposal = {
  /** 提案名称。 */
  title: string;
  /** 提案当前投票或决议状态。 */
  status: string;
  /** 是否已经形成正式决议。 */
  resolved?: boolean;
};

/** 决策过程回放中的时间节点。 */
export type DecisionReplayEvent = {
  /** 节点日期。 */
  date: string;
  /** 节点事件名称。 */
  label: string;
  /** 是否为回放当前定位的关键节点。 */
  active?: boolean;
};
