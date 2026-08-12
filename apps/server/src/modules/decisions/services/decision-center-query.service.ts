/**
 * 本文件负责决策中心跨项目活动、过程分析与只读档案的授权聚合查询。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  DecisionCenterActivityDay,
  DecisionCenterActivityDayDetail,
  DecisionCenterActivityEvent,
  DecisionCenterActivityResponse,
  DecisionCenterAnalyticsResponse,
  DecisionCenterArchiveQuery,
  DecisionCenterArchiveResponse,
  DecisionCenterObservation,
} from '@workspace/contracts/decisions';
import { PrismaService } from '../../../database/prisma.service';
import {
  DecisionEventType,
  DecisionStatus,
  type Prisma,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 决策中心按中国标准时间归档日期。 */
const BUSINESS_TIMEZONE_OFFSET_MINUTES = 8 * 60;
/** 热力图固定展示最近一年的连续日期。 */
const ACTIVITY_DAY_COUNT = 365;
/** 进入讨论后无关键进展超过该天数即计入停滞观察。 */
const STALLED_THRESHOLD_DAYS = 14;
/** 一天包含的毫秒数。 */
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
/** 活动事件查询返回的最小记录。 */
type ActivityEventRecord = {
  /** 事件主键。 */
  id: number;
  /** 事件类型。 */
  type: DecisionEventType;
  /** 事件标题。 */
  title: string;
  /** 事件发生时间。 */
  occurredAt: Date;
  /** 关联会议主键。 */
  meetingId: number | null;
  /** 关联提案主键。 */
  proposalId: number | null;
  /** 关联投票轮次主键。 */
  voteRoundId: number | null;
  /** 关联决议主键。 */
  resolutionId: number | null;
  /** 事件触发者。 */
  actor: { id: number; name: string | null; avatarUrl: string | null } | null;
  /** 事件所属决策。 */
  decision: { id: number; title: string; project: { title: string } };
};

@Injectable()
export class DecisionCenterQueryService {
  /** 注入数据库和统一数据范围授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 查询当前用户过去 365 天的活动热力图，并附带最近活跃日的首屏档案。 */
  async getActivity(
    authorization: AuthorizationContext,
  ): Promise<DecisionCenterActivityResponse> {
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const endDateKey = toBusinessDateKey(new Date());
    const startDateKey = offsetDateKey(endDateKey, -(ACTIVITY_DAY_COUNT - 1));
    const events = await this.findActivityEvents(
      decisionWhere,
      authorization.userId,
      startDateKey,
      endDateKey,
    );
    const days = buildActivityDays(startDateKey, events);
    const initialSummary =
      [...days].reverse().find((day) => day.eventCount > 0) ??
      days[days.length - 1];

    return {
      days,
      initialDay: buildActivityDayDetail(initialSummary, events),
    };
  }

  /** 查询当前用户在热力图中某一天的关键活动档案。 */
  async getActivityDay(
    authorization: AuthorizationContext,
    date: string,
  ): Promise<DecisionCenterActivityDayDetail> {
    assertDateKey(date);
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const events = await this.findActivityEvents(
      decisionWhere,
      authorization.userId,
      date,
      date,
    );
    const summary = buildActivityDays(date, events, 1)[0];

    return buildActivityDayDetail(summary, events);
  }

  /** 计算跨项目决策过程指标与可解释观察。 */
  async getAnalytics(
    authorization: AuthorizationContext,
  ): Promise<DecisionCenterAnalyticsResponse> {
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const [decisions, proposals, voteRounds] = await Promise.all([
      this.prisma.decision.findMany({
        where: decisionWhere,
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          decidedAt: true,
          updatedAt: true,
          project: { select: { title: true } },
          events: {
            where: { type: DecisionEventType.STATUS_CHANGED },
            select: { occurredAt: true },
            orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
            take: 1,
          },
          _count: {
            select: { proposals: true, participants: true, voteRounds: true },
          },
        },
      }),
      this.prisma.decisionProposal.findMany({
        where: { decision: decisionWhere },
        select: { status: true },
      }),
      this.prisma.decisionVoteRound.findMany({
        where: { decision: decisionWhere, status: { not: 'DRAFT' } },
        select: { status: true },
      }),
    ]);
    const resolvedDecisions = decisions.filter(
      (decision) => decision.decidedAt !== null,
    );
    const cycleDays = resolvedDecisions.map((decision) =>
      differenceInDays(decision.createdAt, decision.decidedAt!),
    );
    const discussionDays = resolvedDecisions.flatMap((decision) => {
      const startedAt = decision.events[0]?.occurredAt;
      return startedAt
        ? [differenceInDays(startedAt, decision.decidedAt!)]
        : [];
    });
    const endedProposals = proposals.filter(
      (proposal) => proposal.status !== 'OPEN',
    );
    const nonDraftDecisions = decisions.filter(
      (decision) => decision.status !== DecisionStatus.DRAFT,
    );
    const now = new Date();
    const stalledDecisions = decisions.filter((decision) => {
      if (decision.status !== DecisionStatus.DISCUSSING) return false;
      const lastProgressAt = decision.updatedAt;
      return differenceInDays(lastProgressAt, now) >= STALLED_THRESHOLD_DAYS;
    });

    return {
      metrics: {
        averageCycleDays: average(cycleDays),
        medianDiscussionDays: median(discussionDays),
        proposalAdoptionRate: percentage(
          endedProposals.filter((proposal) => proposal.status === 'ACCEPTED')
            .length,
          endedProposals.length,
        ),
        voteClosureRate: percentage(
          voteRounds.filter((round) => round.status === 'CLOSED').length,
          voteRounds.length,
        ),
        formalResolutionRate: percentage(
          resolvedDecisions.length,
          nonDraftDecisions.length,
        ),
        stalledDecisionCount: stalledDecisions.length,
      },
      observations: buildObservations(
        decisions,
        resolvedDecisions,
        stalledDecisions,
        now,
      ),
      stalledThresholdDays: STALLED_THRESHOLD_DAYS,
    };
  }

  /** 查询当前用户可见的跨项目决策档案摘要。 */
  async getArchive(
    authorization: AuthorizationContext,
    query: DecisionCenterArchiveQuery = {},
  ): Promise<DecisionCenterArchiveResponse> {
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const archiveWhere = buildArchiveWhere(decisionWhere, query);
    const [total, decisions] = await Promise.all([
      this.prisma.decision.count({ where: archiveWhere }),
      this.prisma.decision.findMany({
        where: archiveWhere,
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          areaId: true,
          area: { select: { id: true, name: true } },
          project: { select: { id: true, title: true } },
          department: { select: { name: true } },
          decidedAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              participants: true,
              proposals: true,
              voteRounds: true,
              resolutions: true,
              meetingLinks: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: decisions.map((decision) => ({
        id: decision.id,
        title: decision.title,
        description: decision.description,
        status: decision.status,
        scope: decision.areaId === null ? 'PROJECT' : 'AREA',
        project: decision.project,
        area: decision.area,
        departmentName: decision.department.name,
        participantCount: decision._count.participants,
        proposalCount: decision._count.proposals,
        voteRoundCount: decision._count.voteRounds,
        resolutionCount: decision._count.resolutions,
        meetingCount: decision._count.meetingLinks,
        decidedAt: decision.decidedAt?.toISOString() ?? null,
        createdAt: decision.createdAt.toISOString(),
        updatedAt: decision.updatedAt.toISOString(),
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 在已授权决策范围内查询当前用户的四类实际动作。
   *
   * 投票从选票表读取而非事件日志读取，确保匿名投票也能正确计入投票人自己的活动。
   */
  private async findActivityEvents(
    decisionWhere: Prisma.DecisionWhereInput,
    userId: number,
    startDateKey: string,
    endDateKey: string,
  ): Promise<ActivityEventRecord[]> {
    const occurredAt = {
      gte: businessDateStart(startDateKey),
      lt: businessDateStart(offsetDateKey(endDateKey, 1)),
    };
    const decision = {
      select: {
        id: true,
        title: true,
        project: { select: { title: true } },
      },
    };
    const [meetingEvents, proposalEvents, ballots, resolutions] =
      await Promise.all([
        this.prisma.decisionEvent.findMany({
          where: {
            type: DecisionEventType.MEETING_STARTED,
            actorId: userId,
            occurredAt,
            decision: decisionWhere,
          },
          select: {
            id: true,
            title: true,
            occurredAt: true,
            meetingId: true,
            actor: { select: { id: true, name: true, avatarUrl: true } },
            decision,
          },
        }),
        this.prisma.decisionEvent.findMany({
          where: {
            type: DecisionEventType.PROPOSAL_CREATED,
            actorId: userId,
            occurredAt,
            decision: decisionWhere,
          },
          select: {
            id: true,
            title: true,
            occurredAt: true,
            proposalId: true,
            actor: { select: { id: true, name: true, avatarUrl: true } },
            decision,
          },
        }),
        this.prisma.decisionBallot.findMany({
          where: {
            voterId: userId,
            submittedAt: occurredAt,
            round: { decision: decisionWhere },
          },
          select: {
            id: true,
            submittedAt: true,
            round: { select: { id: true, title: true, decision } },
          },
        }),
        this.prisma.decisionResolution.findMany({
          where: {
            decidedById: userId,
            decidedAt: occurredAt,
            decision: decisionWhere,
          },
          select: { id: true, title: true, decidedAt: true, decision },
        }),
      ]);

    return [
      ...meetingEvents.map((event) => ({
        id: event.id,
        type: DecisionEventType.MEETING_STARTED,
        title: event.title,
        occurredAt: event.occurredAt,
        meetingId: event.meetingId,
        proposalId: null,
        voteRoundId: null,
        resolutionId: null,
        actor: event.actor,
        decision: event.decision,
      })),
      ...proposalEvents.map((event) => ({
        id: event.id,
        type: DecisionEventType.PROPOSAL_CREATED,
        title: event.title,
        occurredAt: event.occurredAt,
        meetingId: null,
        proposalId: event.proposalId,
        voteRoundId: null,
        resolutionId: null,
        actor: event.actor,
        decision: event.decision,
      })),
      ...ballots.map((ballot) => ({
        id: ballot.id,
        type: DecisionEventType.VOTE_CAST,
        title: `参与投票：${ballot.round.title}`,
        occurredAt: ballot.submittedAt,
        meetingId: null,
        proposalId: null,
        voteRoundId: ballot.round.id,
        resolutionId: null,
        actor: null,
        decision: ballot.round.decision,
      })),
      ...resolutions.map((resolution) => ({
        id: resolution.id,
        type: DecisionEventType.RESOLUTION_CREATED,
        title: `确认决议：${resolution.title}`,
        occurredAt: resolution.decidedAt,
        meetingId: null,
        proposalId: null,
        voteRoundId: null,
        resolutionId: resolution.id,
        actor: null,
        decision: resolution.decision,
      })),
    ].sort(
      (left, right) =>
        right.occurredAt.getTime() - left.occurredAt.getTime() ||
        right.id - left.id,
    );
  }
}

/** 把档案筛选条件叠加到统一授权范围之上。 */
function buildArchiveWhere(
  decisionWhere: Prisma.DecisionWhereInput,
  query: DecisionCenterArchiveQuery,
): Prisma.DecisionWhereInput {
  const keyword = query.keyword?.trim();
  return {
    AND: [
      decisionWhere,
      ...(keyword
        ? [
            {
              OR: [
                { title: { contains: keyword, mode: 'insensitive' as const } },
                {
                  description: {
                    contains: keyword,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  project: {
                    title: { contains: keyword, mode: 'insensitive' as const },
                  },
                },
                {
                  department: {
                    name: { contains: keyword, mode: 'insensitive' as const },
                  },
                },
                {
                  area: {
                    is: {
                      name: { contains: keyword, mode: 'insensitive' as const },
                    },
                  },
                },
              ],
            },
          ]
        : []),
      ...(query.scope === 'PROJECT' ? [{ areaId: null }] : []),
      ...(query.scope === 'AREA' ? [{ areaId: { not: null } }] : []),
      ...(query.status ? [{ status: query.status }] : []),
    ],
  };
}

/** 生成连续日期，并把事件按日期和资源主键去重聚合。 */
function buildActivityDays(
  startDateKey: string,
  events: ActivityEventRecord[],
  dayCount = ACTIVITY_DAY_COUNT,
): DecisionCenterActivityDay[] {
  const eventsByDate = new Map<string, ActivityEventRecord[]>();
  events.forEach((event) => {
    const dateKey = toBusinessDateKey(event.occurredAt);
    eventsByDate.set(dateKey, [...(eventsByDate.get(dateKey) ?? []), event]);
  });

  return Array.from({ length: dayCount }, (_, index) => {
    const date = offsetDateKey(startDateKey, index);
    const dayEvents = eventsByDate.get(date) ?? [];
    const decisionIds = new Set(dayEvents.map((event) => event.decision.id));
    const meetingIds = new Set(
      dayEvents.flatMap((event) =>
        event.meetingId === null ? [] : [event.meetingId],
      ),
    );
    const proposalIds = new Set(
      dayEvents.flatMap((event) =>
        event.proposalId === null ? [] : [event.proposalId],
      ),
    );
    const voteRoundIds = new Set(
      dayEvents.flatMap((event) =>
        event.voteRoundId === null ? [] : [event.voteRoundId],
      ),
    );
    const resolutionIds = new Set(
      dayEvents.flatMap((event) =>
        event.resolutionId === null ? [] : [event.resolutionId],
      ),
    );

    return {
      date,
      decisionCount: decisionIds.size,
      eventCount:
        meetingIds.size +
        proposalIds.size +
        voteRoundIds.size +
        resolutionIds.size,
      meetingCount: meetingIds.size,
      proposalCount: proposalIds.size,
      voteCount: voteRoundIds.size,
      resolutionCount: resolutionIds.size,
    };
  });
}

/** 将某天聚合数据与事件列表组合成同页过程档案。 */
function buildActivityDayDetail(
  summary: DecisionCenterActivityDay,
  events: ActivityEventRecord[],
): DecisionCenterActivityDayDetail {
  return {
    summary,
    events: events
      .filter((event) => toBusinessDateKey(event.occurredAt) === summary.date)
      .map(toActivityEvent),
  };
}

/** 将数据库事件映射为决策中心可展示的安全摘要。 */
function toActivityEvent(
  event: ActivityEventRecord,
): DecisionCenterActivityEvent {
  return {
    id: event.id,
    type: event.type,
    title: event.title,
    actor: event.actor,
    occurredAt: event.occurredAt.toISOString(),
    decision: {
      id: event.decision.id,
      title: event.decision.title,
      projectTitle: event.decision.project.title,
    },
  };
}

/** 从决策样本中提取六类可解释的过程观察。 */
function buildObservations<
  T extends {
    id: number;
    title: string;
    createdAt: Date;
    decidedAt: Date | null;
    project: { title: string };
    events: { occurredAt: Date }[];
    _count: { proposals: number; participants: number; voteRounds: number };
  },
>(
  decisions: T[],
  resolved: T[],
  stalled: T[],
  now: Date,
): DecisionCenterObservation[] {
  const observations: DecisionCenterObservation[] = [];
  const fastest = minBy(resolved, (decision) =>
    differenceInDays(decision.createdAt, decision.decidedAt!),
  );
  const longest = maxBy(stalled, (decision) =>
    differenceInDays(decision.events[0]?.occurredAt ?? decision.createdAt, now),
  );
  const mostProposals = maxBy(
    decisions.filter((decision) => decision._count.proposals > 0),
    (decision) => decision._count.proposals,
  );
  const mostParticipants = maxBy(
    decisions.filter((decision) => decision._count.participants > 0),
    (decision) => decision._count.participants,
  );
  const recentResolution = maxBy(resolved, (decision) =>
    decision.decidedAt!.getTime(),
  );
  const consensus = maxBy(
    resolved.filter((decision) => decision._count.voteRounds === 0),
    (decision) => decision.decidedAt!.getTime(),
  );

  pushObservation(
    observations,
    'FASTEST_RESOLUTION',
    fastest,
    fastest ? differenceInDays(fastest.createdAt, fastest.decidedAt!) : null,
    null,
  );
  pushObservation(
    observations,
    'LONGEST_DISCUSSION',
    longest,
    longest
      ? differenceInDays(
          longest.events[0]?.occurredAt ?? longest.createdAt,
          now,
        )
      : null,
    null,
  );
  pushObservation(
    observations,
    'MOST_PROPOSALS',
    mostProposals,
    mostProposals?._count.proposals ?? null,
    null,
  );
  pushObservation(
    observations,
    'MOST_PARTICIPANTS',
    mostParticipants,
    mostParticipants?._count.participants ?? null,
    null,
  );
  pushObservation(
    observations,
    'RECENT_RESOLUTION',
    recentResolution,
    null,
    recentResolution?.decidedAt ?? null,
  );
  pushObservation(
    observations,
    'CONSENSUS_WITHOUT_VOTE',
    consensus,
    null,
    consensus?.decidedAt ?? null,
  );
  return observations;
}

/** 在存在有效决策样本时追加一条过程观察。 */
function pushObservation<
  T extends { id: number; title: string; project: { title: string } },
>(
  observations: DecisionCenterObservation[],
  kind: DecisionCenterObservation['kind'],
  decision: T | undefined,
  value: number | null,
  occurredAt: Date | null,
): void {
  if (!decision) return;
  observations.push({
    kind,
    value,
    occurredAt: occurredAt?.toISOString() ?? null,
    decision: {
      id: decision.id,
      title: decision.title,
      projectTitle: decision.project.title,
    },
  });
}

/** 按选择器返回数值最小的记录。 */
function minBy<T>(items: T[], selector: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>(
    (selected, item) =>
      !selected || selector(item) < selector(selected) ? item : selected,
    undefined,
  );
}

/** 按选择器返回数值最大的记录。 */
function maxBy<T>(items: T[], selector: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>(
    (selected, item) =>
      !selected || selector(item) > selector(selected) ? item : selected,
    undefined,
  );
}

/** 计算两时刻之间的天数并保留一位小数。 */
function differenceInDays(start: Date, end: Date): number {
  return roundOne(
    Math.max(0, end.getTime() - start.getTime()) / DAY_IN_MILLISECONDS,
  );
}

/** 计算平均值；没有样本时返回 null。 */
function average(values: number[]): number | null {
  return values.length === 0
    ? null
    : roundOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/** 计算中位数；没有样本时返回 null。 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : roundOne((sorted[middle - 1] + sorted[middle]) / 2);
}

/** 将分子分母转换为百分比；无分母时返回 null。 */
function percentage(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : roundOne((numerator / denominator) * 100);
}

/** 将数值保留一位小数。 */
function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 将 UTC 时间转换为业务时区日期键。 */
function toBusinessDateKey(date: Date): string {
  return new Date(date.getTime() + BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** 将业务日期键偏移指定天数。 */
function offsetDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** 把业务日期零点转换为数据库查询使用的 UTC 时刻。 */
function businessDateStart(dateKey: string): Date {
  return new Date(
    new Date(`${dateKey}T00:00:00.000Z`).getTime() -
      BUSINESS_TIMEZONE_OFFSET_MINUTES * 60 * 1000,
  );
}

/** 校验客户端提交的日期键，避免无效日期进入数据库查询。 */
function assertDateKey(dateKey: string): void {
  const parsedDate = new Date(`${dateKey}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== dateKey
  ) {
    throw new BadRequestException('日期格式无效，请使用 YYYY-MM-DD');
  }
}
