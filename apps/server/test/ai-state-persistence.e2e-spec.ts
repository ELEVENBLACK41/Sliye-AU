/**
 * 本文件使用真实 PostgreSQL 验证 AI 2.2 的幂等原子创建、单 Run 门禁、事件序号和 Step 用量汇总。
 * 所有测试数据使用唯一前缀并在结束时按精确主键清理，不读取或修改既有业务数据。
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
  AiRunStatus,
  ProjectMemberRole,
  UserStatus,
} from '../src/generated/prisma';
import { AiModule } from '../src/modules/ai/ai.module';
import { AiEventService } from '../src/modules/ai/services/ai-event.service';
import { AiRunLeaseService } from '../src/modules/ai/services/ai-run-lease.service';
import { AiStepService } from '../src/modules/ai/services/ai-step.service';
import { AiThreadService } from '../src/modules/ai/services/ai-thread.service';
import type { AuthorizationContext } from '../src/modules/auth/types/auth.types';

jest.setTimeout(30_000);

/** 当前测试创建并在结束时精确删除的业务 Fixture 主键。 */
type AiStateFixture = {
  /** 测试部门主键。 */
  departmentId: number;
  /** 测试用户主键。 */
  userId: number;
  /** 测试项目主键。 */
  projectId: number;
  /** 测试决策主键。 */
  decisionId: number;
};

/** 为测试用户创建拥有全部权限、但仍受项目成员关系约束的授权上下文。 */
function createAuthorization(
  userId: number,
  departmentId: number,
): AuthorizationContext {
  return {
    userId,
    deptId: departmentId,
    isSuperAdmin: true,
    roleCodes: new Set(['AI_STATE_E2E']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

/** 断言未知错误是携带指定稳定业务码的 BusinessException。 */
function expectBusinessErrorCode(error: unknown, code: ApiErrorCode): void {
  expect(error).toBeInstanceOf(BusinessException);
  expect(error).toMatchObject({ code });
}

/** 清理由测试启动失败遗留且严格匹配专用名称和邮箱后缀的旧 Fixture。 */
async function cleanupStaleAiStateFixtures(
  prisma: PrismaService,
): Promise<void> {
  const users = await prisma.user.findMany({
    where: {
      name: 'AI 状态测试用户',
      email: { startsWith: 'ai-state-', endsWith: '@example.test' },
    },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  if (userIds.length > 0) {
    await prisma.aiThread.deleteMany({
      where: { ownerUserId: { in: userIds } },
    });
    await prisma.decision.deleteMany({
      where: { creatorId: { in: userIds } },
    });
    await prisma.project.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.department.deleteMany({
    where: {
      code: { startsWith: 'AI-E2E-' },
      name: 'AI 状态测试部门',
      users: { none: {} },
      projects: { none: {} },
      decisions: { none: {} },
    },
  });
}

describe('AI 状态持久化（真实 PostgreSQL）', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let threadService: AiThreadService;
  let eventService: AiEventService;
  let runLeaseService: AiRunLeaseService;
  let stepService: AiStepService;
  let fixture: AiStateFixture;
  let authorization: AuthorizationContext;

  /** 启动真实 Prisma 连接并创建独立用户、项目和 Decision。 */
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
    eventService = moduleFixture.get(AiEventService);
    runLeaseService = moduleFixture.get(AiRunLeaseService);
    stepService = moduleFixture.get(AiStepService);
    await cleanupStaleAiStateFixtures(prisma);

    const unique = randomUUID();
    const department = await prisma.department.create({
      data: {
        code: `AI-E2E-${unique}`,
        name: 'AI 状态测试部门',
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `ai-state-${unique}@example.test`,
        name: 'AI 状态测试用户',
        status: UserStatus.ACTIVE,
        deptId: department.id,
      },
    });
    const project = await prisma.project.create({
      data: {
        title: 'AI 状态测试项目',
        createdById: user.id,
        ownerId: user.id,
        deptId: department.id,
        members: {
          create: { userId: user.id, role: ProjectMemberRole.OWNER },
        },
      },
    });
    const decision = await prisma.decision.create({
      data: {
        title: 'AI 状态测试决策',
        description: '只用于真实 PostgreSQL 并发验证',
        projectId: project.id,
        creatorId: user.id,
        ownerId: user.id,
        deptId: department.id,
      },
    });

    fixture = {
      departmentId: department.id,
      userId: user.id,
      projectId: project.id,
      decisionId: decision.id,
    };
    authorization = createAuthorization(user.id, department.id);
  });

  /** 删除本文件创建的全部 AI 与业务 Fixture，并关闭 Prisma 连接。 */
  afterAll(async () => {
    if (fixture) {
      await prisma.aiThread.deleteMany({
        where: { ownerUserId: fixture.userId },
      });
      await prisma.decision.deleteMany({
        where: { id: fixture.decisionId },
      });
      await prisma.project.deleteMany({ where: { id: fixture.projectId } });
      await prisma.user.deleteMany({ where: { id: fixture.userId } });
      await prisma.department.deleteMany({
        where: { id: fixture.departmentId },
      });
    }
    await moduleFixture?.close();
  });

  it('相同幂等键并发创建时应只保留一组 Thread、Message 和 Run', async () => {
    const clientRequestId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        threadService.createInitialRun({
          authorization,
          decisionId: fixture.decisionId,
          content: '为什么需要记录这项决策？',
          clientRequestId,
          modelRole: 'standard',
        }),
      ),
    );
    const threadIds = new Set(results.map((result) => result.thread.id));
    const messageIds = new Set(results.map((result) => result.message.id));
    const runIds = new Set(results.map((result) => result.run.id));

    expect(threadIds.size).toBe(1);
    expect(messageIds.size).toBe(1);
    expect(runIds.size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(
      await prisma.aiThread.count({
        where: {
          ownerUserId: fixture.userId,
          decisionId: fixture.decisionId,
        },
      }),
    ).toBe(1);

    await expect(
      threadService.createInitialRun({
        authorization,
        decisionId: fixture.decisionId,
        content: '同一个键不能更换成另一条问题',
        clientRequestId,
        modelRole: 'standard',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
    });
  });

  it('并发追加事件时应分配不重不漏的 Run 内单调序号', async () => {
    const run = await prisma.aiRun.findFirstOrThrow({
      where: { thread: { ownerUserId: fixture.userId } },
      select: { id: true },
    });
    const lease = await runLeaseService.claim({
      authorization,
      runId: run.id,
      leaseDurationMs: 60_000,
    });
    const events = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        eventService.append({
          authorization,
          runId: run.id,
          executionLeaseId: lease.executionLeaseId,
          type: 'ASSISTANT_TEXT_DELTA',
          data: {
            messageId: randomUUID(),
            delta: `片段-${index + 1}`,
          },
        }),
      ),
    );
    const sequences = events
      .map((event) => event.sequence)
      .sort((left, right) => left - right);

    expect(sequences).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 2),
    );
    const persistedSequences = (
      await prisma.aiEvent.findMany({
        where: { runId: run.id },
        select: { sequence: true },
        orderBy: { sequence: 'asc' },
      })
    ).map((event) => event.sequence);
    expect(persistedSequences).toEqual(
      Array.from({ length: 21 }, (_, index) => index + 1),
    );
  });

  it('应逐次保存模型 Step 并原子累加 Run Token 与成本', async () => {
    const run = await prisma.aiRun.findFirstOrThrow({
      where: {
        thread: { ownerUserId: fixture.userId },
        status: AiRunStatus.RUNNING,
      },
      select: { id: true, executionLeaseId: true },
    });
    expect(run.executionLeaseId).not.toBeNull();
    const executionLeaseId = run.executionLeaseId!;
    const startedAt = new Date('2026-08-21T06:00:00.000Z');
    const [firstStep, secondStep] = await Promise.all([
      stepService.recordModelStep({
        authorization,
        runId: run.id,
        executionLeaseId,
        sequence: 1,
        modelRole: 'standard',
        resolvedModelId: 'openai/test-model',
        provider: 'openai',
        responseId: 'response-1',
        finishReason: 'tool-calls',
        inputTokens: 120,
        outputTokens: 30,
        estimatedCostUsd: 0.0012,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 800),
        timeToFirstOutputMs: 200,
      }),
      stepService.recordModelStep({
        authorization,
        runId: run.id,
        executionLeaseId,
        sequence: 2,
        modelRole: 'standard',
        resolvedModelId: 'openai/test-model',
        provider: 'openai',
        responseId: 'response-2',
        finishReason: 'stop',
        inputTokens: 180,
        outputTokens: 70,
        estimatedCostUsd: 0.0025,
        startedAt: new Date(startedAt.getTime() + 900),
        finishedAt: new Date(startedAt.getTime() + 1900),
        timeToFirstOutputMs: 250,
      }),
    ]);
    const aggregate = await prisma.aiRun.findUniqueOrThrow({
      where: { id: run.id },
      select: {
        modelCallCount: true,
        inputTokens: true,
        outputTokens: true,
        totalTokens: true,
        estimatedCostUsd: true,
      },
    });

    expect([firstStep.sequence, secondStep.sequence].sort()).toEqual([1, 2]);
    expect(aggregate).toMatchObject({
      modelCallCount: 2,
      inputTokens: 300,
      outputTokens: 100,
      totalTokens: 400,
    });
    expect(aggregate.estimatedCostUsd.toNumber()).toBeCloseTo(0.0037, 8);
  });

  it('同一 Thread 的不同幂等键并发提交时应只创建一个非终态 Run', async () => {
    const initial = await prisma.aiRun.findFirstOrThrow({
      where: { thread: { ownerUserId: fixture.userId } },
      select: { id: true, threadId: true },
    });
    await prisma.$transaction([
      prisma.aiRun.update({
        where: { id: initial.id },
        data: { status: AiRunStatus.COMPLETED, finishedAt: new Date() },
      }),
      prisma.aiThread.update({
        where: { id: initial.threadId },
        data: { activeRunId: null },
      }),
    ]);

    const settled = await Promise.allSettled([
      threadService.createMessageRun({
        authorization,
        threadId: initial.threadId,
        content: '并发问题 A',
        clientRequestId: randomUUID(),
        modelRole: 'standard',
      }),
      threadService.createMessageRun({
        authorization,
        threadId: initial.threadId,
        content: '并发问题 B',
        clientRequestId: randomUUID(),
        modelRole: 'standard',
      }),
    ]);
    const fulfilled = settled.filter((result) => result.status === 'fulfilled');
    const rejected = settled.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expectBusinessErrorCode(
      rejected[0].reason,
      API_ERROR_CODES.AI_THREAD_RUN_ACTIVE,
    );
    expect(
      await prisma.aiRun.count({
        where: {
          threadId: initial.threadId,
          status: {
            in: [
              AiRunStatus.QUEUED,
              AiRunStatus.RUNNING,
              AiRunStatus.WAITING_APPROVAL,
              AiRunStatus.CANCELLATION_REQUESTED,
            ],
          },
        },
      }),
    ).toBe(1);
  });

  it('同一 Thread 的相同幂等键并发重放时应返回同一条 Message 和 Run', async () => {
    const activeRun = await prisma.aiRun.findFirstOrThrow({
      where: {
        thread: { ownerUserId: fixture.userId },
        status: AiRunStatus.QUEUED,
      },
      select: { id: true, threadId: true },
    });
    await prisma.$transaction([
      prisma.aiRun.update({
        where: { id: activeRun.id },
        data: { status: AiRunStatus.COMPLETED, finishedAt: new Date() },
      }),
      prisma.aiThread.update({
        where: { id: activeRun.threadId },
        data: { activeRunId: null },
      }),
    ]);

    const clientRequestId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        threadService.createMessageRun({
          authorization,
          threadId: activeRun.threadId,
          content: '相同的后续问题只应创建一次',
          clientRequestId,
          modelRole: 'standard',
        }),
      ),
    );

    expect(new Set(results.map((result) => result.message.id)).size).toBe(1);
    expect(new Set(results.map((result) => result.run.id)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
  });
});
