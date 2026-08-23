/**
 * 本文件使用真实 PostgreSQL 验证 AI Thread 历史列表的稳定游标、归档筛选和权限过滤。
 * 测试只创建带专用前缀的隔离数据，并在结束时按精确用户主键清理。
 */

import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  API_ERROR_CODES,
  type ApiErrorCode,
} from '@workspace/contracts/common';
import { BusinessException } from '../src/common/exceptions/business.exception';
import { PrismaModule } from '../src/database/prisma.module';
import { PrismaService } from '../src/database/prisma.service';
import { ProjectMemberRole, UserStatus } from '../src/generated/prisma';
import { AiModule } from '../src/modules/ai/ai.module';
import { AiThreadHistoryQueryService } from '../src/modules/ai/services/ai-thread-history-query.service';
import { AiThreadService } from '../src/modules/ai/services/ai-thread.service';
import type { AuthorizationContext } from '../src/modules/auth/types/auth.types';

jest.setTimeout(30_000);

/** 当前测试创建并负责清理的业务与 Thread 主键。 */
type AiThreadHistoryFixture = {
  /** 测试部门主键。 */
  departmentId: number;
  /** Thread 拥有者主键。 */
  ownerUserId: number;
  /** 同项目但不拥有 Thread 的观察者主键。 */
  viewerUserId: number;
  /** 正常可访问项目主键。 */
  projectId: number;
  /** 已撤销成员关系的项目主键。 */
  hiddenProjectId: number;
  /** 用于分页和归档筛选的决策主键。 */
  primaryDecisionId: number;
  /** 用于验证 Decision 筛选的第二项决策主键。 */
  secondaryDecisionId: number;
  /** 已失去访问权的决策主键。 */
  hiddenDecisionId: number;
  /** 主决策下按更新时间倒序排列的未归档 Thread。 */
  primaryActiveThreadIds: string[];
  /** 主决策下唯一归档 Thread。 */
  primaryArchivedThreadId: string;
  /** 第二项决策下唯一 Thread。 */
  secondaryThreadId: string;
  /** 权限撤销后不得返回的 Thread。 */
  hiddenThreadId: string;
};

/** 为测试用户创建具备系统权限、但仍受项目成员关系约束的授权上下文。 */
function createAuthorization(
  userId: number,
  departmentId: number,
): AuthorizationContext {
  return {
    userId,
    deptId: departmentId,
    isSuperAdmin: true,
    roleCodes: new Set(['AI_THREAD_HISTORY_E2E']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

/** 断言未知错误是携带指定稳定业务码的 BusinessException。 */
function expectBusinessErrorCode(error: unknown, code: ApiErrorCode): void {
  expect(error).toBeInstanceOf(BusinessException);
  expect(error).toMatchObject({ code });
}

/** 清理上次异常中断后遗留且严格匹配专用邮箱前缀的测试数据。 */
async function cleanupStaleFixtures(prisma: PrismaService): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      email: { startsWith: 'ai-thread-history-', endsWith: '@example.test' },
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length === 0) {
    return;
  }

  await prisma.aiThread.deleteMany({ where: { ownerUserId: { in: userIds } } });
  await prisma.decision.deleteMany({ where: { creatorId: { in: userIds } } });
  await prisma.project.deleteMany({ where: { createdById: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.department.deleteMany({
    where: {
      code: { startsWith: 'AI-HISTORY-' },
      users: { none: {} },
      projects: { none: {} },
      decisions: { none: {} },
    },
  });
}

describe('AI Thread 历史列表（真实 PostgreSQL）', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let threadService: AiThreadService;
  let historyQueryService: AiThreadHistoryQueryService;
  let fixture: AiThreadHistoryFixture;
  let ownerAuthorization: AuthorizationContext;
  let viewerAuthorization: AuthorizationContext;

  /** 创建两个可访问决策、一个后续失权决策和确定顺序的 Thread 历史。 */
  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AiModule,
      ],
    }).compile();
    await moduleFixture.init();

    prisma = moduleFixture.get(PrismaService);
    threadService = moduleFixture.get(AiThreadService);
    historyQueryService = moduleFixture.get(AiThreadHistoryQueryService);
    await cleanupStaleFixtures(prisma);

    const unique = randomUUID();
    const department = await prisma.department.create({
      data: { code: `AI-HISTORY-${unique}`, name: 'AI 历史列表测试部门' },
    });
    const owner = await prisma.user.create({
      data: {
        email: `ai-thread-history-owner-${unique}@example.test`,
        name: 'AI 历史列表拥有者',
        status: UserStatus.ACTIVE,
        deptId: department.id,
      },
    });
    const viewer = await prisma.user.create({
      data: {
        email: `ai-thread-history-viewer-${unique}@example.test`,
        name: 'AI 历史列表观察者',
        status: UserStatus.ACTIVE,
        deptId: department.id,
      },
    });
    const project = await prisma.project.create({
      data: {
        title: 'AI 历史列表测试项目',
        createdById: owner.id,
        ownerId: owner.id,
        deptId: department.id,
        members: {
          create: [
            { userId: owner.id, role: ProjectMemberRole.OWNER },
            { userId: viewer.id, role: ProjectMemberRole.VIEWER },
          ],
        },
      },
    });
    const hiddenProject = await prisma.project.create({
      data: {
        title: 'AI 历史列表失权项目',
        createdById: owner.id,
        ownerId: owner.id,
        deptId: department.id,
        members: {
          create: { userId: owner.id, role: ProjectMemberRole.OWNER },
        },
      },
    });
    const primaryDecision = await prisma.decision.create({
      data: {
        title: 'AI 历史列表主决策',
        projectId: project.id,
        creatorId: owner.id,
        ownerId: owner.id,
        deptId: department.id,
      },
    });
    const secondaryDecision = await prisma.decision.create({
      data: {
        title: 'AI 历史列表第二决策',
        projectId: project.id,
        creatorId: owner.id,
        ownerId: owner.id,
        deptId: department.id,
      },
    });
    const hiddenDecision = await prisma.decision.create({
      data: {
        title: 'AI 历史列表失权决策',
        projectId: hiddenProject.id,
        creatorId: owner.id,
        ownerId: owner.id,
        deptId: department.id,
      },
    });

    ownerAuthorization = createAuthorization(owner.id, department.id);
    viewerAuthorization = createAuthorization(viewer.id, department.id);

    const primaryThreads = await Promise.all(
      ['主决策历史一', '主决策历史二', '主决策历史三', '主决策已归档'].map(
        (content) =>
          threadService.createInitialRun({
            authorization: ownerAuthorization,
            decisionId: primaryDecision.id,
            content,
            clientRequestId: randomUUID(),
            modelRole: 'standard',
          }),
      ),
    );
    const secondaryThread = await threadService.createInitialRun({
      authorization: ownerAuthorization,
      decisionId: secondaryDecision.id,
      content: '第二决策历史',
      clientRequestId: randomUUID(),
      modelRole: 'standard',
    });
    const hiddenThread = await threadService.createInitialRun({
      authorization: ownerAuthorization,
      decisionId: hiddenDecision.id,
      content: '失权后不得出现的历史',
      clientRequestId: randomUUID(),
      modelRole: 'standard',
    });
    const activeThreadTimes = [
      new Date('2026-08-23T04:03:00.000Z'),
      new Date('2026-08-23T04:02:00.000Z'),
      new Date('2026-08-23T04:01:00.000Z'),
    ];

    await Promise.all([
      ...primaryThreads.slice(0, 3).map((thread, index) =>
        prisma.aiThread.update({
          where: { id: thread.thread.id },
          data: { updatedAt: activeThreadTimes[index] },
        }),
      ),
      prisma.aiThread.update({
        where: { id: primaryThreads[3].thread.id },
        data: {
          archivedAt: new Date('2026-08-23T04:04:00.000Z'),
          updatedAt: new Date('2026-08-23T04:04:00.000Z'),
        },
      }),
      prisma.aiThread.update({
        where: { id: secondaryThread.thread.id },
        data: { updatedAt: new Date('2026-08-23T04:05:00.000Z') },
      }),
      prisma.aiThread.update({
        where: { id: hiddenThread.thread.id },
        data: { updatedAt: new Date('2026-08-23T04:06:00.000Z') },
      }),
    ]);
    await prisma.projectMember.delete({
      where: {
        projectId_userId: { projectId: hiddenProject.id, userId: owner.id },
      },
    });

    fixture = {
      departmentId: department.id,
      ownerUserId: owner.id,
      viewerUserId: viewer.id,
      projectId: project.id,
      hiddenProjectId: hiddenProject.id,
      primaryDecisionId: primaryDecision.id,
      secondaryDecisionId: secondaryDecision.id,
      hiddenDecisionId: hiddenDecision.id,
      primaryActiveThreadIds: primaryThreads
        .slice(0, 3)
        .map((thread) => thread.thread.id),
      primaryArchivedThreadId: primaryThreads[3].thread.id,
      secondaryThreadId: secondaryThread.thread.id,
      hiddenThreadId: hiddenThread.thread.id,
    };
  });

  /** 精确删除本文件 Fixture 并关闭 Prisma 连接。 */
  afterAll(async () => {
    if (prisma && fixture) {
      await prisma.aiThread.deleteMany({
        where: { ownerUserId: fixture.ownerUserId },
      });
      await prisma.decision.deleteMany({
        where: {
          id: {
            in: [
              fixture.primaryDecisionId,
              fixture.secondaryDecisionId,
              fixture.hiddenDecisionId,
            ],
          },
        },
      });
      await prisma.project.deleteMany({
        where: { id: { in: [fixture.projectId, fixture.hiddenProjectId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [fixture.ownerUserId, fixture.viewerUserId] } },
      });
      await prisma.department.delete({ where: { id: fixture.departmentId } });
    }
    await moduleFixture?.close();
  });

  it('应按复合游标稳定分页且默认排除已归档 Thread', async () => {
    const firstPage = await historyQueryService.listThreads(
      ownerAuthorization,
      {
        decisionId: fixture.primaryDecisionId,
        limit: 2,
      },
    );

    expect(firstPage.items.map((thread) => thread.id)).toEqual(
      fixture.primaryActiveThreadIds.slice(0, 2),
    );
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await historyQueryService.listThreads(
      ownerAuthorization,
      {
        decisionId: fixture.primaryDecisionId,
        cursor: firstPage.nextCursor!,
        limit: 2,
      },
    );

    expect(secondPage.items.map((thread) => thread.id)).toEqual(
      fixture.primaryActiveThreadIds.slice(2),
    );
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('应独立返回归档 Thread 并保持未归档列表不混入归档项', async () => {
    const archivedPage = await historyQueryService.listThreads(
      ownerAuthorization,
      {
        decisionId: fixture.primaryDecisionId,
        archiveState: 'archived',
      },
    );

    expect(archivedPage.items.map((thread) => thread.id)).toEqual([
      fixture.primaryArchivedThreadId,
    ]);
    expect(archivedPage.items[0]?.archivedAt).not.toBeNull();
  });

  it('应按 Decision 筛选，并拒绝返回其他用户或已失权项目的 Thread', async () => {
    const secondaryPage = await historyQueryService.listThreads(
      ownerAuthorization,
      {
        decisionId: fixture.secondaryDecisionId,
      },
    );
    const viewerPage = await historyQueryService.listThreads(
      viewerAuthorization,
      {
        decisionId: fixture.primaryDecisionId,
      },
    );
    const allOwnerThreads = await historyQueryService.listThreads(
      ownerAuthorization,
      { limit: 50 },
    );

    expect(secondaryPage.items.map((thread) => thread.id)).toEqual([
      fixture.secondaryThreadId,
    ]);
    expect(viewerPage.items).toEqual([]);
    expect(
      allOwnerThreads.items.some(
        (thread) => thread.id === fixture.hiddenThreadId,
      ),
    ).toBe(false);
  });

  it('应以稳定字段错误拒绝损坏的分页游标', async () => {
    await historyQueryService
      .listThreads(ownerAuthorization, { cursor: 'not-a-valid-cursor' })
      .then(() => {
        throw new Error('损坏游标不应成功返回');
      })
      .catch((error: unknown) => {
        expectBusinessErrorCode(
          error,
          API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        );
        expect(error).toMatchObject({
          details: [
            expect.objectContaining({
              field: 'cursor',
              rule: 'AI_THREAD_CURSOR_INVALID',
            }),
          ],
        });
      });
  });
});
