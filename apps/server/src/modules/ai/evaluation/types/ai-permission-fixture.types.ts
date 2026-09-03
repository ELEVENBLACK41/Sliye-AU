/**
 * 本文件定义 AI 权限评测 Fixture V1 的后端内部不可变元数据合同，
 * 用于表达项目、讨论分区、证据来源和匿名选票诱饵的最小可见性边界。
 */
import type {
  AiGoldQueryForbiddenSourceReference,
  AiGoldQuerySourceReference,
} from './ai-gold-query.types';

/** 权限评测 Fixture 使用的稳定版本标识。 */
export type AiPermissionFixtureVersion = string;

/** 讨论分区在权限评测中的公开或私有可见性。 */
export type AiPermissionFixtureAreaVisibility =
  /** 项目成员均可见的公共讨论分区。 */
  | 'public'
  /** 仅显式分区成员可见的私有讨论分区。 */
  | 'private';

/** 项目成员关系的最小权限评测元数据。 */
export type AiPermissionFixtureProjectMembership = {
  /** 已加入项目的虚拟用户主键。 */
  readonly userId: number;
  /** 用户已加入的虚拟项目主键。 */
  readonly projectId: number;
};

/** 讨论分区的最小权限评测元数据。 */
export type AiPermissionFixtureDiscussionArea = {
  /** 虚拟讨论分区主键。 */
  readonly areaId: number;
  /** 讨论分区所属的虚拟项目主键。 */
  readonly projectId: number;
  /** 决定讨论分区是否还需要显式成员关系的可见性。 */
  readonly visibility: AiPermissionFixtureAreaVisibility;
};

/** 私有讨论分区显式成员关系的最小权限评测元数据。 */
export type AiPermissionFixturePrivateAreaMembership = {
  /** 已加入私有讨论分区的虚拟用户主键。 */
  readonly userId: number;
  /** 用户已加入的私有讨论分区主键。 */
  readonly areaId: number;
};

/** 普通业务证据来源与其权限、生命周期定位信息。 */
export type AiPermissionFixtureBusinessEvidenceSource =
  /** 复用 Gold Query 中允许作为普通业务证据的安全来源引用。 */
  AiGoldQuerySourceReference & {
    /** 证据来源所属的虚拟项目主键，用于跨项目过滤测试。 */
    readonly projectId: number;
    /** 证据来源关联的虚拟决策主键，用于跨决策过滤测试。 */
    readonly decisionId: number;
    /** 证据来源所属讨论分区主键；项目级来源固定为 `null`。 */
    readonly areaId: number | null;
    /** 来源删除时间的 ISO 8601 字符串；未删除时固定为 `null`。 */
    readonly deletedAt: string | null;
  };

/** 匿名投票单张选票的权限泄漏诱饵元数据。 */
export type AiPermissionFixtureAnonymousVoteBallotDecoy =
  /** 复用 Gold Query 中禁止检索、引用或泄露的来源引用语义。 */
  AiGoldQueryForbiddenSourceReference & {
    /** 固定为单张选票来源，防止该诱饵被误当作允许的业务证据。 */
    readonly sourceType: 'vote_ballot';
    /** 选票所属的虚拟项目主键，用于跨项目过滤测试。 */
    readonly projectId: number;
    /** 选票关联的虚拟决策主键，用于跨决策过滤测试。 */
    readonly decisionId: number;
    /** 选票所在讨论分区主键；项目级决策为 `null`。 */
    readonly areaId: number | null;
    /** 选票所属的虚拟投票轮次主键。 */
    readonly voteRoundId: number;
    /** 匿名选票的虚拟投票人主键，仅用于泄漏检测。 */
    readonly voterId: number;
    /** 固定为匿名选票，禁止检索、展示、推断或关联个人投票。 */
    readonly isAnonymous: true;
  };

/** 权限评测中可出现的普通业务证据或匿名选票泄漏诱饵。 */
export type AiPermissionFixtureSource =
  /** 可在权限与删除状态过滤后作为业务证据的普通来源。 */
  | AiPermissionFixtureBusinessEvidenceSource
  /** 绝不能进入允许证据集的匿名单张选票诱饵。 */
  | AiPermissionFixtureAnonymousVoteBallotDecoy;

/** 权限评测 Fixture V1 的不可变根数据结构。 */
export type AiPermissionFixtureV1 = {
  /** 用于复现当前权限评测数据的稳定 Fixture 版本。 */
  readonly fixtureVersion: AiPermissionFixtureVersion;
  /** 评测中已知的全部虚拟用户主键；非成员以缺少成员关系表达。 */
  readonly userIds: readonly number[];
  /** 评测中已知的全部虚拟项目主键。 */
  readonly projectIds: readonly number[];
  /** 项目成员关系；已知用户缺少对应关系即表示项目非成员。 */
  readonly projectMemberships: readonly AiPermissionFixtureProjectMembership[];
  /** 项目内讨论分区及其公开或私有可见性。 */
  readonly discussionAreas: readonly AiPermissionFixtureDiscussionArea[];
  /** 私有分区显式成员关系；缺少对应关系即表示私有区非成员。 */
  readonly privateAreaMemberships: readonly AiPermissionFixturePrivateAreaMembership[];
  /** 同时包含普通业务证据与匿名选票诱饵的只读来源集合。 */
  readonly sources: readonly AiPermissionFixtureSource[];
};
