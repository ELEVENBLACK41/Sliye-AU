/**
 * 本文件验证会议中心跨项目查询的参与关系、可见性、筛选、排序和分页边界。
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest 非对称匹配器在类型层会退化为 any，仅用于断言 Prisma 调用参数。 */
import { BadRequestException } from '@nestjs/common';

import type { PrismaService } from '../../../database/prisma.service';
import {
  MeetingParticipantRole,
  MeetingStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { ProjectAccessService } from '../../projects/services/project-access.service';
import { MeetingCenterQueryService } from './meeting-center-query.service';

/** 创建会议中心测试使用的授权上下文。 */
function createAuthorization(): AuthorizationContext {
  return {
    userId: 7,
    deptId: 3,
    isSuperAdmin: false,
    roleCodes: new Set(['MEMBER']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

/** 创建只覆盖会议中心读取能力的测试替身。 */
function createHarness() {
  const prisma = {
    meetingSession: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const projectAccessService = {
    buildVisibleAreaWhere: jest.fn((userId: number, projectId?: number) => ({
      visibleToUserId: userId,
      ...(projectId ? { projectId } : {}),
    })),
  };
  const service = new MeetingCenterQueryService(
    prisma as unknown as PrismaService,
    projectAccessService as unknown as ProjectAccessService,
  );
  return { prisma, projectAccessService, service };
}

describe('MeetingCenterQueryService', () => {
  it('概览应同时限制当前用户参与关系与项目分区可见性', async () => {
    const { service, prisma, projectAccessService } = createHarness();

    await service.getOverview(createAuthorization(), {
      from: '2026-08-08T16:00:00.000Z',
      to: '2026-08-15T16:00:00.000Z',
      projectId: 10,
      role: MeetingParticipantRole.HOST,
    });

    expect(projectAccessService.buildVisibleAreaWhere).toHaveBeenCalledWith(
      7,
      10,
    );
    expect(prisma.meetingSession.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.meetingSession.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          area: { visibleToUserId: 7, projectId: 10 },
          participants: {
            some: { userId: 7, role: MeetingParticipantRole.HOST },
          },
          OR: [
            {
              scheduledAt: {
                gte: new Date('2026-08-08T16:00:00.000Z'),
                lt: new Date('2026-08-15T16:00:00.000Z'),
              },
            },
            {
              scheduledAt: null,
              startedAt: {
                gte: new Date('2026-08-08T16:00:00.000Z'),
                lt: new Date('2026-08-15T16:00:00.000Z'),
              },
            },
            {
              scheduledAt: null,
              startedAt: null,
              createdAt: {
                gte: new Date('2026-08-08T16:00:00.000Z'),
                lt: new Date('2026-08-15T16:00:00.000Z'),
              },
            },
          ],
        }),
        orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(prisma.meetingSession.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: MeetingStatus.LIVE }),
      }),
    );
    expect(prisma.meetingSession.findMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ status: MeetingStatus.SCHEDULED }),
        take: 3,
      }),
    );
  });

  it('历史记录应组合关键词、状态、日期、角色并返回真实分页总数', async () => {
    const { service, prisma } = createHarness();
    prisma.meetingSession.count.mockResolvedValue(42);

    await expect(
      service.getRecords(createAuthorization(), {
        keyword: '权限',
        projectId: 10,
        role: MeetingParticipantRole.ATTENDEE,
        status: MeetingStatus.CANCELLED,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-11T00:00:00.000Z',
        page: 2,
        pageSize: 20,
      }),
    ).resolves.toEqual({ items: [], page: 2, pageSize: 20, total: 42 });

    expect(prisma.meetingSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: MeetingStatus.CANCELLED,
          participants: {
            some: { userId: 7, role: MeetingParticipantRole.ATTENDEE },
          },
          AND: expect.any(Array),
        }),
        orderBy: [
          { startedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: 20,
        take: 20,
      }),
    );
  });

  it('倒置或超过 31 天的日期范围应拒绝查询', async () => {
    const { service } = createHarness();

    await expect(
      service.getOverview(createAuthorization(), {
        from: '2026-08-12T00:00:00.000Z',
        to: '2026-08-11T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getRecords(createAuthorization(), {
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-08-11T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
