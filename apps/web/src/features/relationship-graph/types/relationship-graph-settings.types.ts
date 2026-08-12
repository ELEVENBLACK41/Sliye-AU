/**
 * 本文件定义新版个人关系图谱的本地设置、筛选参数与颜色匹配上下文类型。
 */

import type {
  RelationshipGraphNodeType,
  RelationshipGraphRelationType,
} from '@workspace/contracts/relationship-graph';

/** 当前关系图谱设置的数据结构版本。 */
export type RelationshipGraphSettingsVersion = 1;

/** 关系图谱的节点筛选设置。 */
export type RelationshipGraphFilterSettings = {
  /** 各业务节点类型是否参与绘制。 */
  enabledNodeTypes: Record<RelationshipGraphNodeType, boolean>;
  /** 是否只展示当前用户自身及与当前用户直接相关的节点。 */
  onlyDirectlyRelatedToMe: boolean;
  /** 是否保留在当前筛选结果中没有任何连线的节点。 */
  showOrphans: boolean;
  /** 是否围绕当前选中节点仅展示有限层级的邻接子图。 */
  localGraphEnabled: boolean;
  /** 局部图谱向外遍历的邻接层数。 */
  localGraphDepth: 1 | 2 | 3 | 4;
};

/** 关系图谱的视觉显示设置。 */
export type RelationshipGraphAppearanceSettings = {
  /** 是否在有方向的连线上绘制箭头。 */
  showArrows: boolean;
  /** 节点文字的基础透明度。 */
  labelOpacity: number;
  /** 节点半径相对于基础尺寸的倍率。 */
  nodeSizeScale: number;
  /** 连线宽度相对于基础宽度的倍率。 */
  linkWidthScale: number;
};

/** 关系图谱力导向模拟的可调参数。 */
export type RelationshipGraphForceSettings = {
  /** 节点回到画布中心的向心力强度。 */
  centerStrength: number;
  /** 节点之间的多体排斥力，数值应为负数。 */
  chargeStrength: number;
  /** 相连节点彼此靠近的力强度。 */
  linkStrength: number;
  /** 相连节点期望保持的基础距离。 */
  linkDistance: number;
};

/** 一条颜色组规则包含的匹配条件；各非空条件组之间采用 AND。 */
export type RelationshipGraphColorRuleConditions = {
  /** 允许匹配的节点类型；空数组表示不限制。 */
  nodeTypes: RelationshipGraphNodeType[];
  /** 允许匹配的业务状态；空数组表示不限制。 */
  statuses: string[];
  /** 允许匹配的所属项目主键；空数组表示不限制。 */
  projectIds: number[];
  /** 允许匹配的所属项目标题；与项目主键条件在同一条件组内采用 OR。 */
  projectTitles: string[];
  /** 节点标题需要包含的关键词；空字符串表示不限制。 */
  titleKeyword: string;
  /** 节点与当前用户之间允许出现的关系；空数组表示不限制。 */
  myRelations: RelationshipGraphRelationType[];
};

/** 用户可排序、启停和删除的一条节点颜色组规则。 */
export type RelationshipGraphColorRule = {
  /** 仅用于本地编辑和排序的稳定规则标识。 */
  id: string;
  /** 设置面板中展示的规则名称。 */
  name: string;
  /** 当前规则是否参与颜色匹配。 */
  enabled: boolean;
  /** 传给 Canvas 绘制上下文的用户自定义 CSS 颜色值。 */
  color: string;
  /** 当前规则包含的全部匹配条件。 */
  conditions: RelationshipGraphColorRuleConditions;
};

/** 关系图谱保存到当前浏览器的完整设置。 */
export type RelationshipGraphSettings = {
  /** 用于拒绝旧版或不兼容本地数据的设置版本。 */
  version: RelationshipGraphSettingsVersion;
  /** 节点范围和局部图谱筛选设置。 */
  filters: RelationshipGraphFilterSettings;
  /** 节点、文字与连线的视觉设置。 */
  appearance: RelationshipGraphAppearanceSettings;
  /** D3 力导向模拟参数。 */
  forces: RelationshipGraphForceSettings;
  /** 按数组顺序执行、第一条命中优先的颜色组规则。 */
  colorRules: RelationshipGraphColorRule[];
};

/** 更新设置时允许按分组提供的浅层补丁。 */
export type RelationshipGraphSettingsPatch = {
  /** 节点筛选设置补丁。 */
  filters?: Partial<RelationshipGraphFilterSettings>;
  /** 视觉显示设置补丁。 */
  appearance?: Partial<RelationshipGraphAppearanceSettings>;
  /** 力导向参数补丁。 */
  forces?: Partial<RelationshipGraphForceSettings>;
  /** 用新数组完整替换颜色组规则。 */
  colorRules?: RelationshipGraphColorRule[];
};

/** 单次筛选关系图谱时由交互状态补充的参数。 */
export type RelationshipGraphFilterOptions = {
  /** 局部图谱启用时作为遍历中心的节点标识。 */
  focusedNodeId?: string | null;
};

/** 预计算后的颜色规则匹配上下文，避免每个节点重复扫描全部关系。 */
export type RelationshipGraphColorContext = {
  /** 当前用户在图数据中对应的用户节点标识。 */
  currentUserNodeId: string | null;
  /** 项目数据库主键到项目节点标题的映射。 */
  projectTitleById: ReadonlyMap<number, string>;
  /** 每个节点与当前用户之间直接存在的关系集合。 */
  myRelationsByNodeId: ReadonlyMap<string, ReadonlySet<RelationshipGraphRelationType>>;
};
