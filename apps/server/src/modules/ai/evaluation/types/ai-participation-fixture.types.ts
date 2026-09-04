/**
 * 本文件定义 `listMyParticipatedDecisions` 的脱敏评测 Fixture 与 Gold Query 合同。
 * Fixture 只表达项目、私有分区、参与关系和决策摘要，不模拟 Prisma 查询或 AI Runtime；
 * Gold Query 通过期望输出和 DECISION 来源列表冻结后续业务工具需要满足的边界。
 */

import type {
  ListMyParticipatedDecisionsInput,
  ListMyParticipatedDecisionsOutput,
} from '@workspace/contracts/ai';
import type {
  DecisionParticipantRole,
  DecisionStatus,
} from '@workspace/contracts/decisions';

/** 参与决策 Fixture 使用的稳定版本标识。 */
export type AiParticipationFixtureVersion = string;

/** 脱敏项目的最小展示信息。 */
export type AiParticipationFixtureProject = {
  /** 虚拟项目主键。 */
  readonly projectId: number;
  /** 项目中文名称。 */
  readonly title: string;
};

/** 参与决策 Fixture 中的私有讨论分区。 */
export type AiParticipationFixturePrivateArea = {
  /** 虚拟私有分区主键。 */
  readonly areaId: number;
  /** 私有分区所属的虚拟项目主键。 */
  readonly projectId: number;
  /** 私有分区中文名称。 */
  readonly name: string;
};

/** 评测用户与项目之间的成员关系。 */
export type AiParticipationFixtureProjectMembership = {
  /** 虚拟用户主键。 */
  readonly userId: number;
  /** 用户加入的虚拟项目主键。 */
  readonly projectId: number;
};

/** 评测用户与私有讨论分区之间的显式成员关系。 */
export type AiParticipationFixtureAreaMembership = {
  /** 虚拟用户主键。 */
  readonly userId: number;
  /** 用户加入的虚拟私有分区主键。 */
  readonly areaId: number;
};

/** 一条脱敏决策及其参与关系集合。 */
export type AiParticipationFixtureDecision = {
  /** 虚拟决策主键，同时作为 DECISION 来源主键。 */
  readonly decisionId: number;
  /** 决策所属虚拟项目主键。 */
  readonly projectId: number;
  /** 决策所属项目的中文名称。 */
  readonly projectTitle: string;
  /** 项目级决策为 null，私有小组级决策为对应分区主键。 */
  readonly areaId: number | null;
  /** 私有小组级决策的分区名称；项目级决策为 null。 */
  readonly areaName: string | null;
  /** 决策标题。 */
  readonly title: string;
  /** 决策当前业务状态。 */
  readonly status: DecisionStatus;
  /** 决策最后更新时间。 */
  readonly updatedAt: string;
  /** 决策归档时间；非归档决策固定为 null。 */
  readonly archivedAt: string | null;
  /** 当前 Fixture 中已保存的决策参与关系。 */
  readonly participants: readonly AiParticipationFixtureParticipant[];
};

/** 一条脱敏决策参与关系。 */
export type AiParticipationFixtureParticipant = {
  /** 虚拟用户主键。 */
  readonly userId: number;
  /** 用户在当前决策中的角色。 */
  readonly role: DecisionParticipantRole;
};

/** Gold Query 期望登记的一条列表项来源。 */
export type AiParticipationGoldSourceReference = {
  /** 当前工具只允许登记决策实体来源。 */
  readonly sourceType: 'DECISION';
  /** 与列表项 decisionId 对齐的虚拟决策主键。 */
  readonly sourceId: number;
};

/** 当前用户参与决策列表与统计的一条 Gold Query。 */
export type AiParticipationGoldQuery = {
  /** 在当前 Fixture 版本内唯一的 Query 标识。 */
  readonly id: string;
  /** 面向评测的中文用户问题。 */
  readonly question: string;
  /** 服务端应注入并使用的当前用户主键。 */
  readonly requesterId: number;
  /** 模型可以表达的窄筛选输入；不包含 requesterId。 */
  readonly input: ListMyParticipatedDecisionsInput;
  /** 后续工具在当前 Query 下必须返回的完整受控结果。 */
  readonly expectedOutput: ListMyParticipatedDecisionsOutput;
  /** 仅对应实际返回列表项的 DECISION 来源，不为 total 或 statusCounts 伪造来源。 */
  readonly expectedSourceReferences: readonly AiParticipationGoldSourceReference[];
  /** 参与关系存在但因非成员、私有区失权、归档筛选或未参与而不得出现在列表中的决策。 */
  readonly forbiddenDecisionIds: readonly number[];
};

/** 当前用户参与决策评测 Fixture 的根数据结构。 */
export type AiParticipatedDecisionsFixtureV1 = {
  /** 用于复现当前参与决策评测数据的稳定版本。 */
  readonly fixtureVersion: AiParticipationFixtureVersion;
  /** Fixture 中的虚拟项目。 */
  readonly projects: readonly AiParticipationFixtureProject[];
  /** Fixture 中的虚拟私有讨论分区。 */
  readonly privateAreas: readonly AiParticipationFixturePrivateArea[];
  /** Fixture 中的项目成员关系。 */
  readonly projectMemberships: readonly AiParticipationFixtureProjectMembership[];
  /** Fixture 中的私有分区显式成员关系。 */
  readonly areaMemberships: readonly AiParticipationFixtureAreaMembership[];
  /** Fixture 中的脱敏决策及其参与关系。 */
  readonly decisions: readonly AiParticipationFixtureDecision[];
  /** 参与决策列表与统计的 Gold Query 集合。 */
  readonly queries: readonly AiParticipationGoldQuery[];
};
