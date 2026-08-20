/**
 * 本文件定义 AI 决策形成过程评测 Fixture V1 的后端内部不可变数据合同，
 * 用于以脱敏、可重复的材料描述一项决策从讨论到正式决议的完整形成过程。
 * 该合同不对应 Prisma 实体，不包含 DecisionTask、任务执行闭环、单张 VoteBallot 或敏感信息。
 */
import type { AiGoldQuerySourceType } from './ai-gold-query.types';

/** 决策形成过程评测 Fixture 使用的稳定版本标识。 */
export type AiDecisionProcessFixtureVersion = string;

/** 所有时间字段使用的 ISO 8601 时间字符串，例如 `2026-08-20T08:00:00.000Z`。 */
export type AiDecisionProcessFixtureIsoTimestamp = string;

/** 决策形成过程 Fixture 可复用的脱敏对抗证据标记。 */
export type AiDecisionProcessFixtureEvidenceRiskLabel =
  /** 证据内容包含用于验证系统边界的提示注入文本。 */
  | 'prompt_injection';

/** 评测证据共有的定位、权限范围与删除状态字段。 */
type AiDecisionProcessFixtureEvidenceSource<
  TSourceType extends AiGoldQuerySourceType,
> = {
  /** 与 Gold Query `sourceReference.sourceType` 对齐的证据来源类型。 */
  readonly sourceType: TSourceType;
  /** 与 Gold Query `sourceReference.sourceId` 对齐的稳定脱敏证据主键。 */
  readonly sourceId: number;
  /** 证据所属的虚拟决策主键。 */
  readonly decisionId: number;
  /** 证据所属讨论分区主键；项目级证据固定为 `null`。 */
  readonly areaId: number | null;
  /** 证据删除时间的 ISO 8601 字符串；未删除时固定为 `null`。 */
  readonly deletedAt: AiDecisionProcessFixtureIsoTimestamp | null;
};

/** 评测 Fixture 中的最小决策事实。 */
export type AiDecisionProcessFixtureDecision = {
  /** 固定为决策实体来源，供 Gold Query 精确引用。 */
  readonly sourceType: 'decision';
  /** 与 Gold Query 决策来源引用对齐的稳定脱敏决策主键。 */
  readonly sourceId: number;
  /** 决策所属的虚拟项目主键。 */
  readonly projectId: number;
  /** 决策所属讨论分区主键；项目级决策固定为 `null`。 */
  readonly areaId: number | null;
  /** 决策标题。 */
  readonly title: string;
  /** 决策背景说明；无说明时固定为 `null`。 */
  readonly description: string | null;
  /** 决策当前状态，仅保留形成过程评测所需的领域状态。 */
  readonly status: 'DRAFT' | 'DISCUSSING' | 'RESOLVED' | 'CANCELLED' | 'ARCHIVED';
  /** 决策正式形成时间的 ISO 8601 字符串；尚未形成时固定为 `null`。 */
  readonly decidedAt: AiDecisionProcessFixtureIsoTimestamp | null;
  /** 决策创建时间的 ISO 8601 字符串。 */
  readonly createdAt: AiDecisionProcessFixtureIsoTimestamp;
};

/** 评测 Fixture 中的脱敏讨论消息证据。 */
export type AiDecisionProcessFixtureDiscussionMessage = AiDecisionProcessFixtureEvidenceSource<'discussion_message'> & {
  /** 消息所属会议主键；非会议讨论消息固定为 `null`。 */
  readonly meetingId: number | null;
  /** 消息正文，可包含脱敏的正常讨论或对抗文本。 */
  readonly content: string;
  /** 消息作者的脱敏展示标记；系统消息或无作者时固定为 `null`。 */
  readonly authorLabel: string | null;
  /** 消息创建时间的 ISO 8601 字符串。 */
  readonly createdAt: AiDecisionProcessFixtureIsoTimestamp;
  /** 对抗评测标记；普通讨论消息固定为 `null`。 */
  readonly evidenceRiskLabel: AiDecisionProcessFixtureEvidenceRiskLabel | null;
};

/** 评测 Fixture 中的最小决策提案证据。 */
export type AiDecisionProcessFixtureProposal = AiDecisionProcessFixtureEvidenceSource<'proposal'> & {
  /** 提案形成会议主键；非会议场景创建的提案固定为 `null`。 */
  readonly meetingId: number | null;
  /** 提案标题。 */
  readonly title: string;
  /** 提案补充说明；无说明时固定为 `null`。 */
  readonly description: string | null;
  /** 提案当前状态。 */
  readonly status: 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
  /** 提案提出人的脱敏展示标记；未提供时固定为 `null`。 */
  readonly creatorLabel: string | null;
  /** 提案被采纳时间的 ISO 8601 字符串；未采纳时固定为 `null`。 */
  readonly acceptedAt: AiDecisionProcessFixtureIsoTimestamp | null;
  /** 提案创建时间的 ISO 8601 字符串。 */
  readonly createdAt: AiDecisionProcessFixtureIsoTimestamp;
};

/** 评测 Fixture 支持的非任务型决策过程事件。 */
export type AiDecisionProcessFixtureDecisionEventType =
  /** 决策创建事件。 */
  | 'DECISION_CREATED'
  /** 决策更新事件。 */
  | 'DECISION_UPDATED'
  /** 决策状态变更事件。 */
  | 'STATUS_CHANGED'
  /** 决策参与人变更事件。 */
  | 'PARTICIPANT_ADDED'
  /** 决策参与人移除事件。 */
  | 'PARTICIPANT_REMOVED'
  /** 提案创建事件。 */
  | 'PROPOSAL_CREATED'
  /** 提案更新事件。 */
  | 'PROPOSAL_UPDATED'
  /** 投票轮次创建事件。 */
  | 'VOTE_ROUND_CREATED'
  /** 投票轮次开放事件。 */
  | 'VOTE_ROUND_OPENED'
  /** 投票轮次关闭事件。 */
  | 'VOTE_ROUND_CLOSED'
  /** 正式决议创建事件。 */
  | 'RESOLUTION_CREATED'
  /** 正式决议替代事件。 */
  | 'RESOLUTION_SUPERSEDED'
  /** 正式决议撤销事件。 */
  | 'RESOLUTION_REVOKED'
  /** 重要讨论消息置顶事件。 */
  | 'MESSAGE_PINNED'
  /** 会议开始事件。 */
  | 'MEETING_STARTED'
  /** 会议结束事件。 */
  | 'MEETING_ENDED'
  /** 与决策相关的录像就绪事件。 */
  | 'RECORDING_READY';

/** 评测 Fixture 中的决策过程时间线事件。 */
export type AiDecisionProcessFixtureEvent = AiDecisionProcessFixtureEvidenceSource<'decision_event'> & {
  /** 决策过程中的稳定事件类型；不包含任何任务创建或更新事件。 */
  readonly type: AiDecisionProcessFixtureDecisionEventType;
  /** 面向过程回放的事件标题。 */
  readonly title: string;
  /** 事件关联的讨论消息来源主键；未关联时固定为 `null`。 */
  readonly messageSourceId: number | null;
  /** 事件关联的会议主键；未关联时固定为 `null`。 */
  readonly meetingId: number | null;
  /** 事件关联的提案来源主键；未关联时固定为 `null`。 */
  readonly proposalSourceId: number | null;
  /** 事件关联的投票轮次来源主键；未关联时固定为 `null`。 */
  readonly voteRoundSourceId: number | null;
  /** 事件关联的正式决议来源主键；未关联时固定为 `null`。 */
  readonly resolutionSourceId: number | null;
  /** 事件实际发生时间的 ISO 8601 字符串。 */
  readonly occurredAt: AiDecisionProcessFixtureIsoTimestamp;
};

/** 评测 Fixture 中单个投票选项的允许公开聚合结果。 */
export type AiDecisionProcessFixtureVoteOptionResult = {
  /** 轮次内稳定的选项代码。 */
  readonly code: string;
  /** 选项展示名称。 */
  readonly label: string;
  /** 选项补充说明；无说明时固定为 `null`。 */
  readonly description: string | null;
  /** 选项关联的提案来源主键；未关联提案时固定为 `null`。 */
  readonly proposalSourceId: number | null;
  /** 选项的稳定展示顺序。 */
  readonly sortOrder: number;
  /** 该选项的公开聚合得票数，不包含任何单张选票或投票人信息。 */
  readonly voteCount: number | null;
};

/** 评测 Fixture 中的一轮投票及其允许公开的聚合结果。 */
export type AiDecisionProcessFixtureVoteRound = AiDecisionProcessFixtureEvidenceSource<'vote_round'> & {
  /** 投票发起会议主键；非会议投票固定为 `null`。 */
  readonly meetingId: number | null;
  /** 投票轮次标题。 */
  readonly title: string;
  /** 投票背景、规则或补充说明；无说明时固定为 `null`。 */
  readonly description: string | null;
  /** 投票选择规则。 */
  readonly method: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'APPROVAL';
  /** 投票轮次生命周期状态。 */
  readonly status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'CANCELLED';
  /** 是否为匿名投票；无论取值如何，本合同都只允许聚合结果。 */
  readonly isAnonymous: boolean;
  /** 达到有效投票所需的最少选票数；未设置时固定为 `null`。 */
  readonly quorumCount: number | null;
  /** 已提交选票的公开聚合总数，不包含单张选票。 */
  readonly totalBallots: number | null;
  /** 是否达到法定人数；投票尚未结束或未计算时固定为 `null`。 */
  readonly quorumMet: boolean | null;
  /** 每个可公开选项的聚合结果。 */
  readonly options: readonly AiDecisionProcessFixtureVoteOptionResult[];
  /** 投票开放时间的 ISO 8601 字符串；尚未开放时固定为 `null`。 */
  readonly openedAt: AiDecisionProcessFixtureIsoTimestamp | null;
  /** 投票关闭或取消时间的 ISO 8601 字符串；尚未结束时固定为 `null`。 */
  readonly closedAt: AiDecisionProcessFixtureIsoTimestamp | null;
};

/** 评测 Fixture 中的已正式确认决议。 */
export type AiDecisionProcessFixtureResolution = AiDecisionProcessFixtureEvidenceSource<'resolution'> & {
  /** 决议形成会议主键；非会议形成的决议固定为 `null`。 */
  readonly meetingId: number | null;
  /** 决议依据的提案来源主键；不基于提案时固定为 `null`。 */
  readonly sourceProposalId: number | null;
  /** 决议依据的投票轮次来源主键；不基于投票时固定为 `null`。 */
  readonly sourceVoteRoundId: number | null;
  /** 正式决议标题。 */
  readonly title: string;
  /** 正式决议正文或确认结论。 */
  readonly content: string;
  /** 决议在形成过程中的用途类型。 */
  readonly kind: 'INTERIM' | 'FINAL' | 'SUPPLEMENT';
  /** 决议当前有效状态。 */
  readonly status: 'ACTIVE' | 'SUPERSEDED' | 'REVOKED';
  /** 决议正式确认时间的 ISO 8601 字符串。 */
  readonly decidedAt: AiDecisionProcessFixtureIsoTimestamp;
};

/** 评测 Fixture 中归一化后的会议过程证据。 */
export type AiDecisionProcessFixtureMeetingRecord = AiDecisionProcessFixtureEvidenceSource<'meeting_record'> & {
  /** 原始会议主键；无法关联既有 MeetingSession 时固定为 `null`。 */
  readonly meetingId: number | null;
  /** 归一化的会议记录标题；仅用于评测中的来源识别。 */
  readonly title: string;
  /** 脱敏后的归一化会议证据正文，不保存原始转写、音视频地址或参与人敏感信息。 */
  readonly content: string;
  /** 该证据对应的会议过程时间的 ISO 8601 字符串。 */
  readonly occurredAt: AiDecisionProcessFixtureIsoTimestamp;
};

/** 一个完整且可独立复现的决策形成过程评测案例。 */
export type AiDecisionProcessFixtureCase = {
  /** 在同一 Fixture 版本内唯一且跨运行稳定的案例标识。 */
  readonly id: string;
  /** 当前案例的决策主体与最小结构化事实。 */
  readonly decision: AiDecisionProcessFixtureDecision;
  /** 与当前决策相关的脱敏讨论消息证据。 */
  readonly discussionMessages: readonly AiDecisionProcessFixtureDiscussionMessage[];
  /** 与当前决策相关的提案证据。 */
  readonly proposals: readonly AiDecisionProcessFixtureProposal[];
  /** 与当前决策相关的非任务型过程事件。 */
  readonly events: readonly AiDecisionProcessFixtureEvent[];
  /** 与当前决策相关的投票轮次及仅限公开聚合的选项结果。 */
  readonly voteRounds: readonly AiDecisionProcessFixtureVoteRound[];
  /** 与当前决策相关的已正式确认决议。 */
  readonly resolutions: readonly AiDecisionProcessFixtureResolution[];
  /**
   * 仅供评测使用的归一化会议记录证据。
   * 当前 Prisma 不存在独立会议纪要或转写实体，因此该字段绝不能伪装为现有数据库模型。
   */
  readonly meetingRecords: readonly AiDecisionProcessFixtureMeetingRecord[];
};

/** 带稳定版本号的完整决策形成过程评测 Fixture V1。 */
export type AiDecisionProcessFixtureV1 = {
  /** 用于复现当前评测材料的稳定 Fixture 版本。 */
  readonly fixtureVersion: AiDecisionProcessFixtureVersion;
  /** 一个或多个完整、脱敏且可重复运行的决策形成过程案例。 */
  readonly cases: readonly AiDecisionProcessFixtureCase[];
};
