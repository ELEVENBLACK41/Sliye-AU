/**
 * 本文件定义个人关系图谱节点、关系边和完整快照的跨端共享契约。
 */

/** 关系图谱支持展示的业务实体类型。 */
export type RelationshipGraphNodeType =
  | 'PROJECT'
  | 'AREA'
  | 'DECISION'
  | 'MEETING'
  | 'PROPOSAL'
  | 'VOTE_ROUND'
  | 'RESOLUTION'
  | 'USER';

/** 关系图谱中有向边可以表达的稳定业务语义。 */
export type RelationshipGraphRelationType =
  | 'CONTAINS'
  | 'HOSTS'
  | 'DISCUSSES'
  | 'PROCESS_COMPONENT'
  | 'CANDIDATE'
  | 'BASIS'
  | 'SUPERSEDED_BY'
  | 'MEMBER'
  | 'PARTICIPATES'
  | 'CREATED'
  | 'OWNS'
  | 'CONFIRMED';

/** 关系图谱中的一个可交互业务节点。 */
export type RelationshipGraphNode = {
  /** 带实体类型前缀的全图稳定节点标识。 */
  id: string;
  /** 节点对应业务实体的数据库主键。 */
  entityId: number;
  /** 节点对应的业务实体类型。 */
  type: RelationshipGraphNodeType;
  /** 节点在画布和详情面板中展示的主要标题。 */
  title: string;
  /** 节点可选的业务说明或补充摘要。 */
  subtitle: string | null;
  /** 节点实体当前的业务状态；没有状态概念时为 `null`。 */
  status: string | null;
  /** 节点所属项目主键；项目节点使用自身主键，用户节点等不适用场景为 `null`。 */
  projectId: number | null;
  /** 节点所属讨论分区主键；不属于分区时为 `null`。 */
  areaId: number | null;
  /** 节点所属决策主键；不属于决策过程时为 `null`。 */
  decisionId: number | null;
  /** 节点用于搜索、排序和时间提示的 ISO 8601 业务时间；用户节点取最早可见业务关系时间。 */
  timestamp: string;
  /** 用户节点的头像地址；非用户节点或未设置头像时为 `null`。 */
  avatarUrl: string | null;
  /** 节点是否就是当前登录用户对应的用户节点。 */
  isCurrentUser: boolean;
  /** 当前登录用户与该实体的主要业务角色；无直接角色时为 `null`。 */
  currentUserRole: string | null;
};

/** 关系图谱中连接两个节点的一条有向聚合边。 */
export type RelationshipGraphEdge = {
  /** 由有向节点对生成的全图稳定边标识。 */
  id: string;
  /** 有向关系的起点节点标识。 */
  source: string;
  /** 有向关系的终点节点标识。 */
  target: string;
  /** 同一有向节点对合并后的全部稳定业务关系。 */
  relations: RelationshipGraphRelationType[];
  /** 合并后适合直接展示的中文关系标签。 */
  label: string;
  /** 关系数量形成的连线权重，最小值为 `1`。 */
  weight: number;
  /** 当前连线是否具有业务方向；首版固定为 `true`。 */
  directed: boolean;
};

/** 当前用户可见的完整个人关系图谱快照。 */
export type RelationshipGraphResponse = {
  /** 当前权限范围内的全部图谱节点。 */
  nodes: RelationshipGraphNode[];
  /** 当前权限范围内的全部聚合关系边。 */
  edges: RelationshipGraphEdge[];
  /** 生成该快照的当前登录用户主键。 */
  currentUserId: number;
  /** 服务端完成快照聚合的 ISO 8601 时间。 */
  generatedAt: string;
  /** 各节点类型在当前快照中的实际数量。 */
  counts: Record<RelationshipGraphNodeType, number>;
};
