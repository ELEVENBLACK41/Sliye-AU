/**
 * 本文件负责会议中心当前用户维度的跨项目日程聚合和历史记录查询。
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  MeetingCenterListItem,
  MeetingCenterOverviewResponse,
  MeetingCenterRecordsResponse,
} from '@workspace/contracts/meetings';
import { PrismaService } from '../../../database/prisma.service';
import { MeetingStatus, type Prisma } from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { ProjectAccessService } from '../../projects/services/project-access.service';
import type { ListMeetingCenterOverviewDto } from '../dto/list-meeting-center-overview.dto';
import type { ListMeetingCenterRecordsDto } from '../dto/list-meeting-center-records.dto';
import {
  createMeetingCenterInclude,
  toMeetingCenterListItem,
} from '../meetings.mapper';

/** 会议中心单次日期查询允许的最大跨度。 */
const MAX_RANGE_MILLISECONDS = 31 * 24 * 60 * 60 * 1000;
/** 历史记录默认单页数量。 */
const DEFAULT_RECORD_PAGE_SIZE = 20;

@Injectable()
export class MeetingCenterQueryService {
  /** 注入数据库和项目分区可见性服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  /** 查询当前用户指定周日程、进行中会议和最近待开始会议。 */
  async getOverview(
    authorization: AuthorizationContext,
    query: ListMeetingCenterOverviewDto,
  ): Promise<MeetingCenterOverviewResponse> {
    const { from, to } = parseRange(query.from, query.to, true);
    const where = this.buildCurrentUserWhere(
      authorization,
      query.projectId,
      query.role,
    );
    const include = createMeetingCenterInclude(authorization.userId);
    const now = new Date();
    const [calendarItems, activeMeetings, upcomingMeetings] = await Promise.all(
      [
        this.prisma.meetingSession.findMany({
          where: {
            ...where,
            OR: [
              { scheduledAt: { gte: from!, lt: to! } },
              {
                scheduledAt: null,
                startedAt: { gte: from!, lt: to! },
              },
              {
                scheduledAt: null,
                startedAt: null,
                createdAt: { gte: from!, lt: to! },
              },
            ],
          },
          include,
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.meetingSession.findMany({
          where: { ...where, status: MeetingStatus.LIVE },
          include,
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.meetingSession.findMany({
          where: {
            ...where,
            status: MeetingStatus.SCHEDULED,
            scheduledAt: { gte: now },
          },
          include,
          orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
          take: 3,
        }),
      ],
    );

    return {
      calendarItems: calendarItems
        .map(toMeetingCenterListItem)
        .sort(compareScheduleItems),
      activeMeetings: activeMeetings.map(toMeetingCenterListItem),
      upcomingMeetings: upcomingMeetings.map(toMeetingCenterListItem),
    };
  }

  /** 查询当前用户已结束或已取消的跨项目会议记录。 */
  async getRecords(
    authorization: AuthorizationContext,
    query: ListMeetingCenterRecordsDto,
  ): Promise<MeetingCenterRecordsResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_RECORD_PAGE_SIZE;
    const { from, to } = parseRange(query.from, query.to, false);
    const baseWhere = this.buildCurrentUserWhere(
      authorization,
      query.projectId,
      query.role,
    );
    const filters: Prisma.MeetingSessionWhereInput[] = [];

    if (query.keyword) {
      filters.push({
        OR: [
          { title: { contains: query.keyword, mode: 'insensitive' } },
          { area: { name: { contains: query.keyword, mode: 'insensitive' } } },
          {
            area: {
              project: {
                title: { contains: query.keyword, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }
    if (from || to) {
      const range = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: to } : {}),
      };
      filters.push({
        OR: [{ startedAt: range }, { startedAt: null, createdAt: range }],
      });
    }

    const where: Prisma.MeetingSessionWhereInput = {
      ...baseWhere,
      status: query.status ?? {
        in: [MeetingStatus.ENDED, MeetingStatus.CANCELLED],
      },
      ...(filters.length === 0 ? {} : { AND: filters }),
    };
    const include = createMeetingCenterInclude(authorization.userId);
    const [items, total] = await Promise.all([
      this.prisma.meetingSession.findMany({
        where,
        include,
        orderBy: [
          { startedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.meetingSession.count({ where }),
    ]);

    return { items: items.map(toMeetingCenterListItem), page, pageSize, total };
  }

  /** 构造同时满足受邀关系和项目分区可见性的会议条件。 */
  private buildCurrentUserWhere(
    authorization: AuthorizationContext,
    projectId?: number,
    role?: ListMeetingCenterOverviewDto['role'],
  ): Prisma.MeetingSessionWhereInput {
    return {
      area: this.projectAccessService.buildVisibleAreaWhere(
        authorization.userId,
        projectId,
      ),
      participants: {
        some: { userId: authorization.userId, ...(role ? { role } : {}) },
      },
    };
  }
}

/** 按计划时间、实际开始时间、创建时间的统一回退规则排序日程。 */
function compareScheduleItems(
  left: MeetingCenterListItem,
  right: MeetingCenterListItem,
): number {
  return getScheduleTimestamp(left) - getScheduleTimestamp(right);
}

/** 获取一场会议归入日程所使用的时间戳。 */
function getScheduleTimestamp(meeting: MeetingCenterListItem): number {
  return new Date(
    meeting.scheduledAt ?? meeting.startedAt ?? meeting.createdAt,
  ).getTime();
}

/** 解析可选 ISO 时间范围并阻止倒置或超过 31 天的查询。 */
function parseRange(
  fromValue: string | undefined,
  toValue: string | undefined,
  required: boolean,
): { from: Date | undefined; to: Date | undefined } {
  if ((required || fromValue || toValue) && (!fromValue || !toValue)) {
    throw new BadRequestException('会议查询必须提供完整日期范围');
  }
  const from = fromValue ? new Date(fromValue) : undefined;
  const to = toValue ? new Date(toValue) : undefined;
  if (
    from &&
    to &&
    (!Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > MAX_RANGE_MILLISECONDS)
  ) {
    throw new BadRequestException('会议日期范围无效或超过 31 天');
  }
  return { from, to };
}
