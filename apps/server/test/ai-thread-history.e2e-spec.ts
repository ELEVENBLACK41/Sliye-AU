/**
 * 本文件使用真实 PostgreSQL 验证 AI Thread 列表、详情、消息恢复、白名单更新和权限拒绝。
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
import {
  AiMessageRole,
  AiRunCancellationReason,
  AiRunFailureReason,
  AiRunStatus,
  AiSourceDependencyUsage,
  AiThreadLockReason,
  AiThreadScopeState,
  AiToolCallStatus,
  ProjectMemberRole,
  UserStatus,
} from '../src/generated/prisma';
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
  /** 用于详情、消息恢复和更新的决策主键。 */
  detailDecisionId: number;
  /** 用于验证 LOCKED 稳定错误的决策主键。 */
  lockedDecisionId: number;
  /** 主决策下按更新时间倒序排列的未归档 Thread。 */
  primaryActiveThreadIds: string[];
  /** 主决策下唯一归档 Thread。 */
  primaryArchivedThreadId: string;
  /** 第二项决策下唯一 Thread。 */
  secondaryThreadId: string;
  /** 权限撤销后不得返回的 Thread。 */
  hiddenThreadId: string;
  /** 带重试链和工具记录的 Thread。 */
  detailThreadId: string;
  /** 详情 Thread 的原始用户消息。 */
  detailUserMessageId: string;
  /** 详情 Thread 的助手最终消息。 */
  detailAssistantMessageId: string;
  /** 详情 Thread 按创建顺序排列的三次 Run。 */
  detailRunIds: string[];
  /** 当前 owner 仍有 Decision 权限、但 scope 已锁定的 Thread。 */
  lockedThreadId: string;
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

describe('AI Thread 历史接口（真实 PostgreSQL）', () => {
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
    const detailDecision = await prisma.decision.create({
      data: {
        title: 'AI 历史详情恢复决策',
        projectId: project.id,
        creatorId: owner.id,
        ownerId: owner.id,
        deptId: department.id,
      },
    });
    const lockedDecision = await prisma.decision.create({
      data: {
        title: 'AI 历史范围锁定决策',
        projectId: project.id,
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
    const detailThread = await threadService.createInitialRun({
      authorization: ownerAuthorization,
      decisionId: detailDecision.id,
      content: '请恢复这一条带重试和工具状态的消息',
      clientRequestId: randomUUID(),
      modelRole: 'standard',
    });
    const lockedThread = await threadService.createInitialRun({
      authorization: ownerAuthorization,
      decisionId: lockedDecision.id,
      content: '锁定后不得恢复这条消息',
      clientRequestId: randomUUID(),
      modelRole: 'standard',
    });
    const failedRetryRunId = '00000000-0000-4000-8000-000000000001';
    const completedRetryRunId = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    const detailAssistantMessageId = randomUUID();
    const initialRunCreatedAt = new Date('2026-08-23T05:00:00.000Z');
    const retryRunsCreatedAt = new Date('2026-08-23T05:01:00.000Z');

    await prisma.$transaction([
      prisma.aiThread.update({
        where: { id: detailThread.thread.id },
        data: {
          activeRunId: null,
          updatedAt: new Date('2026-08-23T05:03:00.000Z'),
        },
      }),
      prisma.aiMessage.update({
        where: { id: detailThread.message.id },
        data: { createdAt: initialRunCreatedAt },
      }),
      prisma.aiRun.update({
        where: { id: detailThread.run.id },
        data: {
          status: AiRunStatus.CANCELLED,
          cancellationReason: AiRunCancellationReason.USER_REQUESTED,
          finishedAt: new Date('2026-08-23T05:00:30.000Z'),
          createdAt: initialRunCreatedAt,
          updatedAt: new Date('2026-08-23T05:00:30.000Z'),
        },
      }),
      prisma.aiRun.create({
        data: {
          id: failedRetryRunId,
          threadId: detailThread.thread.id,
          userMessageId: detailThread.message.id,
          retryOfRunId: detailThread.run.id,
          status: AiRunStatus.FAILED,
          modelRole: 'STANDARD',
          failureReason: AiRunFailureReason.TOOL_ERROR,
          failureCode: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
          finishedAt: new Date('2026-08-23T05:01:30.000Z'),
          createdAt: retryRunsCreatedAt,
          updatedAt: new Date('2026-08-23T05:01:30.000Z'),
        },
      }),
      prisma.aiRun.create({
        data: {
          id: completedRetryRunId,
          threadId: detailThread.thread.id,
          userMessageId: detailThread.message.id,
          retryOfRunId: detailThread.run.id,
          status: AiRunStatus.COMPLETED,
          modelRole: 'STANDARD',
          resolvedModelId: 'mock/history-model',
          executionLeaseId: randomUUID(),
          executionLeaseExpiresAt: new Date('2026-08-24T00:00:00.000Z'),
          modelCallCount: 1,
          inputTokens: 20,
          outputTokens: 10,
          totalTokens: 30,
          estimatedCostUsd: 0.00003,
          startedAt: retryRunsCreatedAt,
          finishedAt: new Date('2026-08-23T05:02:00.000Z'),
          createdAt: retryRunsCreatedAt,
          updatedAt: new Date('2026-08-23T05:02:00.000Z'),
        },
      }),
      prisma.aiMessage.create({
        data: {
          id: detailAssistantMessageId,
          threadId: detailThread.thread.id,
          runId: completedRetryRunId,
          role: AiMessageRole.ASSISTANT,
          content: '已恢复真实工具结果与来源。',
          createdAt: new Date('2026-08-23T05:02:10.000Z'),
        },
      }),
      prisma.aiToolCall.create({
        data: {
          runId: detailThread.run.id,
          toolCallId: 'history-waiting-tool',
          sequence: 1,
          toolName: 'getDecisionContext',
          status: AiToolCallStatus.WAITING,
          input: { decisionId: detailDecision.id },
          startedAt: null,
        },
      }),
      prisma.aiToolCall.create({
        data: {
          runId: failedRetryRunId,
          toolCallId: 'history-failed-tool',
          sequence: 1,
          toolName: 'getDecisionContext',
          status: AiToolCallStatus.FAILED,
          input: { decisionId: detailDecision.id },
          errorCode: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
          startedAt: retryRunsCreatedAt,
          finishedAt: new Date('2026-08-23T05:01:10.000Z'),
          durationMs: 10_000,
        },
      }),
      prisma.aiToolCall.create({
        data: {
          runId: completedRetryRunId,
          toolCallId: 'history-completed-tool',
          sequence: 1,
          toolName: 'getDecisionContext',
          status: AiToolCallStatus.COMPLETED,
          input: { decisionId: detailDecision.id, internalInput: '不得公开' },
          resultSummary: {
            decisionId: detailDecision.id,
            decisionTitle: detailDecision.title,
            decisionStatus: 'DISCUSSING',
            projectTitle: project.title,
            areaName: null,
            participantCount: 2,
            sourceIds: [
              `decision:${detailDecision.id}`,
              `decision:${detailDecision.id}`,
            ],
            internalSecret: '不得公开',
          },
          startedAt: retryRunsCreatedAt,
          finishedAt: new Date('2026-08-23T05:01:12.000Z'),
          durationMs: 12_000,
        },
      }),
      prisma.aiThread.update({
        where: { id: lockedThread.thread.id },
        data: {
          scopeState: AiThreadScopeState.LOCKED,
          lockReason: AiThreadLockReason.SCOPE_CHANGED,
          scopeChangedAt: new Date('2026-08-23T05:04:00.000Z'),
        },
      }),
      prisma.aiSourceDependency.create({
        data: {
          runId: lockedThread.run.id,
          sourceId: 'decision:2147483647',
          usage: AiSourceDependencyUsage.TOOL_READ,
        },
      }),
    ]);
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
      detailDecisionId: detailDecision.id,
      lockedDecisionId: lockedDecision.id,
      primaryActiveThreadIds: primaryThreads
        .slice(0, 3)
        .map((thread) => thread.thread.id),
      primaryArchivedThreadId: primaryThreads[3].thread.id,
      secondaryThreadId: secondaryThread.thread.id,
      hiddenThreadId: hiddenThread.thread.id,
      detailThreadId: detailThread.thread.id,
      detailUserMessageId: detailThread.message.id,
      detailAssistantMessageId,
      detailRunIds: [
        detailThread.run.id,
        failedRetryRunId,
        completedRetryRunId,
      ],
      lockedThreadId: lockedThread.thread.id,
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
              fixture.detailDecisionId,
              fixture.lockedDecisionId,
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
    expect(firstPage.items[0]).toMatchObject({
      project: {
        id: fixture.projectId,
        title: 'AI 历史列表测试项目',
      },
      decision: {
        id: fixture.primaryDecisionId,
        title: 'AI 历史列表主决策',
      },
      latestRun: { status: 'QUEUED' },
    });
    expect(JSON.stringify(firstPage)).not.toContain('executionLease');
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

  it('应返回真实 Thread 详情，并以 createdAt 和 UUID 确定最近 Run', async () => {
    const detail = await historyQueryService.getThreadDetail(
      ownerAuthorization,
      fixture.detailThreadId,
    );

    expect(detail).toMatchObject({
      id: fixture.detailThreadId,
      project: {
        id: fixture.projectId,
        title: 'AI 历史列表测试项目',
      },
      decision: {
        id: fixture.detailDecisionId,
        title: 'AI 历史详情恢复决策',
      },
      activeRunId: null,
      latestRun: {
        id: fixture.detailRunIds[2],
        status: 'COMPLETED',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      },
    });
    expect(detail).not.toHaveProperty('ownerUserId');
    expect(JSON.stringify(detail)).not.toContain('executionLease');
  });

  it('应稳定分页恢复消息，并把每次 Run 与自己的工具状态和来源关联', async () => {
    const firstPage = await historyQueryService.listThreadMessages(
      ownerAuthorization,
      fixture.detailThreadId,
      { limit: 1 },
    );

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]).toMatchObject({
      message: {
        id: fixture.detailAssistantMessageId,
        role: 'ASSISTANT',
        runId: fixture.detailRunIds[2],
      },
      runs: [],
    });
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await historyQueryService.listThreadMessages(
      ownerAuthorization,
      fixture.detailThreadId,
      { cursor: firstPage.nextCursor!, limit: 1 },
    );
    const userItem = secondPage.items[0];

    expect(userItem?.message).toMatchObject({
      id: fixture.detailUserMessageId,
      role: 'USER',
      runId: null,
    });
    expect(userItem?.runs.map((attempt) => attempt.run.id)).toEqual(
      fixture.detailRunIds,
    );
    expect(userItem?.runs.map((attempt) => attempt.run.status)).toEqual([
      'CANCELLED',
      'FAILED',
      'COMPLETED',
    ]);
    expect(userItem?.runs[0]?.toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'history-waiting-tool',
        status: 'WAITING',
        startedAt: null,
      }),
    ]);
    expect(userItem?.runs[1]).toMatchObject({
      run: {
        failureReason: 'TOOL_ERROR',
        failureCode: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
      },
      sourceIds: [],
      toolCalls: [
        {
          toolCallId: 'history-failed-tool',
          status: 'FAILED',
          errorCode: API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
        },
      ],
    });
    expect(userItem?.runs[2]).toMatchObject({
      sourceIds: [`decision:${fixture.detailDecisionId}`],
      toolCalls: [
        {
          toolCallId: 'history-completed-tool',
          status: 'COMPLETED',
          input: { decisionId: fixture.detailDecisionId },
          resultSummary: {
            sourceIds: [`decision:${fixture.detailDecisionId}`],
          },
        },
      ],
    });
    expect(userItem?.runs[2]?.toolCalls[0]?.input).not.toHaveProperty(
      'internalInput',
    );
    expect(userItem?.runs[2]?.toolCalls[0]?.resultSummary).not.toHaveProperty(
      'internalSecret',
    );
    expect(secondPage.hasMore).toBe(false);
    expect(secondPage.nextCursor).toBeNull();
    expect(JSON.stringify(secondPage)).not.toContain('executionLease');
  });

  it('应按 Unicode 长度更新标题，并归档/恢复而不删除审计记录', async () => {
    const auditCountsBefore = await Promise.all([
      prisma.aiMessage.count({ where: { threadId: fixture.detailThreadId } }),
      prisma.aiRun.count({ where: { threadId: fixture.detailThreadId } }),
      prisma.aiToolCall.count({
        where: { run: { threadId: fixture.detailThreadId } },
      }),
    ]);
    const unicodeTitle = '🙂'.repeat(60);
    const renamed = await historyQueryService.updateThread(
      ownerAuthorization,
      fixture.detailThreadId,
      { title: `  ${unicodeTitle}  ` },
    );

    expect(renamed.thread.title).toBe(unicodeTitle);
    await expect(
      historyQueryService.updateThread(
        ownerAuthorization,
        fixture.detailThreadId,
        { title: '🙂'.repeat(61) },
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
    });
    await expect(
      historyQueryService.updateThread(
        ownerAuthorization,
        fixture.detailThreadId,
        {},
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
    });

    const archived = await historyQueryService.updateThread(
      ownerAuthorization,
      fixture.detailThreadId,
      { title: '归档后仍保留审计的会话', archived: true },
    );
    expect(archived.thread.archivedAt).not.toBeNull();
    expect(
      (
        await historyQueryService.listThreads(ownerAuthorization, {
          decisionId: fixture.detailDecisionId,
        })
      ).items,
    ).toEqual([]);
    expect(
      (
        await historyQueryService.listThreads(ownerAuthorization, {
          decisionId: fixture.detailDecisionId,
          archiveState: 'archived',
        })
      ).items.map((thread) => thread.id),
    ).toEqual([fixture.detailThreadId]);
    expect(
      await Promise.all([
        prisma.aiMessage.count({
          where: { threadId: fixture.detailThreadId },
        }),
        prisma.aiRun.count({ where: { threadId: fixture.detailThreadId } }),
        prisma.aiToolCall.count({
          where: { run: { threadId: fixture.detailThreadId } },
        }),
      ]),
    ).toEqual(auditCountsBefore);

    const restored = await historyQueryService.updateThread(
      ownerAuthorization,
      fixture.detailThreadId,
      { archived: false },
    );
    expect(restored.thread.archivedAt).toBeNull();
  });

  it('详情、消息和更新都应拒绝他人、失权范围与 LOCKED Thread', async () => {
    const otherUserOperations = [
      () =>
        historyQueryService.getThreadDetail(
          viewerAuthorization,
          fixture.detailThreadId,
        ),
      () =>
        historyQueryService.listThreadMessages(
          viewerAuthorization,
          fixture.detailThreadId,
          {},
        ),
      () =>
        historyQueryService.updateThread(
          viewerAuthorization,
          fixture.detailThreadId,
          { title: '他人不得修改' },
        ),
    ];

    for (const operation of otherUserOperations) {
      await expect(operation()).rejects.toMatchObject({
        code: API_ERROR_CODES.AI_THREAD_NOT_FOUND,
      });
    }

    const scopeChangedOperations = [
      () =>
        historyQueryService.getThreadDetail(
          ownerAuthorization,
          fixture.hiddenThreadId,
        ),
      () =>
        historyQueryService.listThreadMessages(
          ownerAuthorization,
          fixture.hiddenThreadId,
          {},
        ),
      () =>
        historyQueryService.updateThread(
          ownerAuthorization,
          fixture.hiddenThreadId,
          { archived: true },
        ),
      () =>
        historyQueryService.getThreadDetail(
          ownerAuthorization,
          fixture.lockedThreadId,
        ),
      () =>
        historyQueryService.listThreadMessages(
          ownerAuthorization,
          fixture.lockedThreadId,
          {},
        ),
      () =>
        historyQueryService.updateThread(
          ownerAuthorization,
          fixture.lockedThreadId,
          { title: '锁定后不得修改' },
        ),
    ];

    for (const operation of scopeChangedOperations) {
      await expect(operation()).rejects.toMatchObject({
        code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
      });
    }
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

    await historyQueryService
      .listThreadMessages(ownerAuthorization, fixture.detailThreadId, {
        cursor: 'not-a-valid-cursor',
      })
      .then(() => {
        throw new Error('损坏的消息游标不应成功返回');
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
              rule: 'AI_THREAD_MESSAGE_CURSOR_INVALID',
            }),
          ],
        });
      });
  });
});
