/**
 * 本文件使用真实 PostgreSQL 验证 AI 2.3～2.4 的租约、故障收敛、真实只读工具和事件补拉闭环。
 * 测试只操作带唯一前缀的专用 Fixture，并在结束后按主键清理。
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
  AiRunFailureReason,
  AiRunStatus,
  AiSourceDependencyUsage,
  DiscussionAreaMemberRole,
  DiscussionAreaType,
  ProjectMemberRole,
  UserStatus,
} from '../src/generated/prisma';
import { AiModule } from '../src/modules/ai/ai.module';
import { AiEventService } from '../src/modules/ai/services/ai-event.service';
import { AiRunLeaseService } from '../src/modules/ai/services/ai-run-lease.service';
import { AiRunReconciliationService } from '../src/modules/ai/services/ai-run-reconciliation.service';
import { AiRunService } from '../src/modules/ai/services/ai-run.service';
import { AiStepService } from '../src/modules/ai/services/ai-step.service';
import { AiThreadService } from '../src/modules/ai/services/ai-thread.service';
import { AiRuntimeQueryService } from '../src/modules/ai/services/ai-runtime-query.service';
import { AiToolCallService } from '../src/modules/ai/services/ai-tool-call.service';
import type { AuthorizationContext } from '../src/modules/auth/types/auth.types';

jest.setTimeout(30_000);

/** 当前测试创建并在结束时精确删除的业务 Fixture 主键。 */
type AiLifecycleFixture = {
  /** 测试部门主键。 */
  departmentId: number;
  /** 测试用户主键。 */
  userId: number;
  /** 测试项目主键。 */
  projectId: number;
  /** 测试决策主键。 */
  decisionId: number;
};

/** 为测试用户创建拥有全部权限、但仍携带真实身份范围的授权上下文。 */
function createAuthorization(
  userId: number,
  departmentId: number,
): AuthorizationContext {
  return {
    userId,
    deptId: departmentId,
    isSuperAdmin: true,
    roleCodes: new Set(['AI_LIFECYCLE_E2E']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

/** 断言未知错误是携带指定稳定业务码的 BusinessException。 */
function expectBusinessErrorCode(error: unknown, code: ApiErrorCode): void {
  expect(error).toBeInstanceOf(BusinessException);
  expect(error).toMatchObject({ code });
}

/** 判断并发结果中被拒绝的 Promise，便于严格检查业务错误。 */
function getRejectedResults(
  results: PromiseSettledResult<unknown>[],
): PromiseRejectedResult[] {
  return results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
}

describe('AI Run 租约与故障收敛（真实 PostgreSQL）', () => {
  let moduleFixture: TestingModule;
  let prisma: PrismaService;
  let threadService: AiThreadService;
  let runLeaseService: AiRunLeaseService;
  let runService: AiRunService;
  let eventService: AiEventService;
  let stepService: AiStepService;
  let reconciliationService: AiRunReconciliationService;
  let runtimeQueryService: AiRuntimeQueryService;
  let toolCallService: AiToolCallService;
  let fixture: AiLifecycleFixture;
  let authorization: AuthorizationContext;

  /** 创建一条独立 Thread、用户消息和排队 Run，避免测试之间共享状态。 */
  async function createQueuedRun(content: string) {
    return threadService.createInitialRun({
      authorization,
      decisionId: fixture.decisionId,
      content,
      clientRequestId: randomUUID(),
      modelRole: 'standard',
    });
  }

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
    runLeaseService = moduleFixture.get(AiRunLeaseService);
    runService = moduleFixture.get(AiRunService);
    eventService = moduleFixture.get(AiEventService);
    stepService = moduleFixture.get(AiStepService);
    reconciliationService = moduleFixture.get(AiRunReconciliationService);
    runtimeQueryService = moduleFixture.get(AiRuntimeQueryService);
    toolCallService = moduleFixture.get(AiToolCallService);

    const unique = randomUUID();
    const department = await prisma.department.create({
      data: {
        code: `AI-LEASE-E2E-${unique}`,
        name: 'AI 租约测试部门',
      },
    });
    const user = await prisma.user.create({
      data: {
        email: `ai-lease-${unique}@example.test`,
        name: 'AI 租约测试用户',
        status: UserStatus.ACTIVE,
        deptId: department.id,
      },
    });
    const project = await prisma.project.create({
      data: {
        title: 'AI 租约测试项目',
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
        title: 'AI 租约测试决策',
        description: '只用于真实 PostgreSQL 租约并发验证',
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
      await prisma.decision.deleteMany({ where: { id: fixture.decisionId } });
      await prisma.project.deleteMany({ where: { id: fixture.projectId } });
      await prisma.user.deleteMany({ where: { id: fixture.userId } });
      await prisma.department.deleteMany({
        where: { id: fixture.departmentId },
      });
    }
    await moduleFixture?.close();
  });

  it('同一 Run 并发领取时应只签发一个可续租的执行租约', async () => {
    const created = await createQueuedRun('验证单执行器领取');
    const settled = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        runLeaseService.claim({
          authorization,
          runId: created.run.id,
          leaseDurationMs: 60_000,
        }),
      ),
    );
    const fulfilled = settled.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof runLeaseService.claim>>
      > => result.status === 'fulfilled',
    );
    const rejected = getRejectedResults(settled);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(7);
    rejected.forEach((result) =>
      expectBusinessErrorCode(
        result.reason,
        API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      ),
    );

    const originalExpiry = fulfilled[0].value.run.executionLeaseExpiresAt;
    const renewed = await runLeaseService.renewLease({
      authorization,
      runId: created.run.id,
      executionLeaseId: fulfilled[0].value.executionLeaseId,
      leaseDurationMs: 120_000,
    });
    expect(renewed.run.status).toBe('RUNNING');
    expect(
      new Date(renewed.run.executionLeaseExpiresAt!).getTime(),
    ).toBeGreaterThan(new Date(originalExpiry!).getTime());
  });

  it('事件补拉只读取排队 Run，不应隐式领取执行租约', async () => {
    const created = await createQueuedRun('验证恢复读取不启动执行器');
    const eventPage = await runtimeQueryService.getRunEvents(
      authorization,
      created.thread.id,
      created.run.id,
      0,
    );

    expect(eventPage.run).toMatchObject({
      id: created.run.id,
      status: 'QUEUED',
    });
    expect(eventPage.run).not.toHaveProperty('executionLeaseId');
    expect(eventPage.run).not.toHaveProperty('executionLeaseExpiresAt');
    await expect(
      runLeaseService.claim({
        authorization,
        runId: created.run.id,
        leaseDurationMs: 60_000,
      }),
    ).resolves.toMatchObject({ run: { status: 'RUNNING' } });
  });

  it('终态 Run 超过单页事件上限时应通过游标完整补拉且不重不漏', async () => {
    const created = await createQueuedRun('验证终态 Run 的多页事件补拉');
    const assistantMessageId = randomUUID();
    const eventCount = 501;

    await prisma.$transaction([
      prisma.aiEvent.createMany({
        data: Array.from({ length: eventCount }, (_, index) => ({
          runId: created.run.id,
          sequence: index + 1,
          type: 'ASSISTANT_TEXT_DELTA' as const,
          payload: {
            messageId: assistantMessageId,
            delta: `片段-${index + 1}`,
          },
        })),
      }),
      prisma.aiRun.update({
        where: { id: created.run.id },
        data: {
          status: AiRunStatus.COMPLETED,
          nextEventSequence: eventCount + 1,
          finishedAt: new Date(),
        },
      }),
      prisma.aiThread.update({
        where: { id: created.thread.id },
        data: { activeRunId: null },
      }),
    ]);

    const recoveredSequences: number[] = [];
    let afterSequence = 0;
    let pageCount = 0;

    for (;;) {
      const page = await runtimeQueryService.getRunEvents(
        authorization,
        created.thread.id,
        created.run.id,
        afterSequence,
      );
      pageCount += 1;
      recoveredSequences.push(...page.events.map((event) => event.sequence));
      expect(page.lastSequence).toBeGreaterThan(afterSequence);
      afterSequence = page.lastSequence;

      if (!page.hasMore) {
        expect(page.run.status).toBe('COMPLETED');
        break;
      }
    }

    expect(pageCount).toBe(2);
    expect(recoveredSequences).toEqual(
      Array.from({ length: eventCount }, (_, index) => index + 1),
    );
    expect(new Set(recoveredSequences).size).toBe(eventCount);
  });

  it('进入取消流程后应拒绝内容写入但保留当前租约产生的模型用量审计', async () => {
    const created = await createQueuedRun('验证取消后的 fencing');
    const lease = await runLeaseService.claim({
      authorization,
      runId: created.run.id,
      leaseDurationMs: 60_000,
    });
    await eventService.append({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      type: 'ASSISTANT_TEXT_DELTA',
      data: { messageId: randomUUID(), delta: '合法片段' },
    });
    const cancellation = await runService.requestCancellation({
      authorization,
      runId: created.run.id,
    });
    expect(cancellation.status).toBe('CANCELLATION_REQUESTED');

    const startedAt = new Date();
    const staleWrites = await Promise.allSettled([
      eventService.append({
        authorization,
        runId: created.run.id,
        executionLeaseId: lease.executionLeaseId,
        type: 'ASSISTANT_TEXT_DELTA',
        data: { messageId: randomUUID(), delta: '迟到片段' },
      }),
      stepService.recordModelStep({
        authorization,
        runId: created.run.id,
        executionLeaseId: lease.executionLeaseId,
        sequence: 1,
        modelRole: 'standard',
        resolvedModelId: 'openai/test-model',
        provider: 'openai',
        responseId: 'late-response',
        finishReason: 'stop',
        inputTokens: 10,
        outputTokens: 5,
        estimatedCostUsd: 0.0001,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 20),
        timeToFirstOutputMs: 10,
      }),
      runService.complete({
        authorization,
        runId: created.run.id,
        executionLeaseId: lease.executionLeaseId,
        assistantMessageId: randomUUID(),
        assistantContent: '迟到完成消息',
        resolvedModelId: 'openai/test-model',
        sourceIds: [],
      }),
    ]);
    [staleWrites[0], staleWrites[2]].forEach((result) => {
      expect(result.status).toBe('rejected');
      if (result.status !== 'rejected') {
        throw new Error('取消后的内容写入不应成功');
      }
      expectBusinessErrorCode(
        result.reason,
        API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      );
    });
    expect(staleWrites[1].status).toBe('fulfilled');

    const cancelled = await runService.confirmCancellation({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
    });
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      executionLeaseId: null,
    });
    expect(
      await prisma.aiThread.findUniqueOrThrow({
        where: { id: created.thread.id },
        select: { activeRunId: true },
      }),
    ).toEqual({ activeRunId: null });
    expect(
      await prisma.aiMessage.count({
        where: { runId: created.run.id, role: 'ASSISTANT' },
      }),
    ).toBe(0);
    expect(
      await prisma.aiRun.findUniqueOrThrow({
        where: { id: created.run.id },
        select: { modelCallCount: true, totalTokens: true },
      }),
    ).toEqual({ modelCallCount: 1, totalTokens: 15 });
    await expect(
      stepService.recordModelStep({
        authorization,
        runId: created.run.id,
        executionLeaseId: lease.executionLeaseId,
        sequence: 2,
        modelRole: 'standard',
        resolvedModelId: 'openai/test-model',
        provider: 'openai',
        responseId: 'after-cancel-response',
        finishReason: 'cancelled',
        inputTokens: 1,
        outputTokens: 0,
        estimatedCostUsd: 0,
        startedAt,
        finishedAt: new Date(startedAt.getTime() + 30),
        timeToFirstOutputMs: null,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
    });
  });

  it('取消与完成并发竞争时应只形成一个终态并正确释放门禁', async () => {
    const created = await createQueuedRun('验证取消与完成竞争');
    const lease = await runLeaseService.claim({
      authorization,
      runId: created.run.id,
      leaseDurationMs: 60_000,
    });
    const settled = await Promise.allSettled([
      runService.requestCancellation({
        authorization,
        runId: created.run.id,
      }),
      runService.complete({
        authorization,
        runId: created.run.id,
        executionLeaseId: lease.executionLeaseId,
        assistantMessageId: randomUUID(),
        assistantContent: '竞争中的最终消息',
        resolvedModelId: 'openai/test-model',
        sourceIds: [],
      }),
    ]);
    let run = await prisma.aiRun.findUniqueOrThrow({
      where: { id: created.run.id },
    });
    if (run.status === AiRunStatus.CANCELLATION_REQUESTED) {
      await runService.confirmCancellation({
        authorization,
        runId: run.id,
        executionLeaseId: lease.executionLeaseId,
      });
      run = await prisma.aiRun.findUniqueOrThrow({ where: { id: run.id } });
    }

    expect([AiRunStatus.CANCELLED, AiRunStatus.COMPLETED]).toContain(
      run.status,
    );
    expect(run.finishedAt).not.toBeNull();
    expect(run.executionLeaseId).toBeNull();
    expect(
      await prisma.aiThread.findUniqueOrThrow({
        where: { id: created.thread.id },
        select: { activeRunId: true },
      }),
    ).toEqual({ activeRunId: null });
    expect(
      await prisma.aiMessage.count({
        where: { runId: run.id, role: 'ASSISTANT' },
      }),
    ).toBe(run.status === AiRunStatus.COMPLETED ? 1 : 0);
    expect(settled.some((result) => result.status === 'fulfilled')).toBe(true);

    const terminalEvents = (
      await prisma.aiEvent.findMany({ where: { runId: run.id } })
    ).filter((event) => {
      const payload = event.payload as { toStatus?: string };
      return ['CANCELLED', 'COMPLETED', 'FAILED'].includes(
        payload.toStatus ?? '',
      );
    });
    expect(terminalEvents).toHaveLength(1);
  });

  it('过期租约并发对账时应只失败一次并拒绝旧执行器继续写入', async () => {
    const created = await createQueuedRun('验证过期租约对账');
    const lease = await runLeaseService.claim({
      authorization,
      runId: created.run.id,
      leaseDurationMs: 60_000,
    });
    const reconciliationNow = new Date();
    await prisma.aiRun.update({
      where: { id: created.run.id },
      data: {
        executionLeaseExpiresAt: new Date(reconciliationNow.getTime() - 1_000),
      },
    });
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        reconciliationService.reconcileExpiredRuns({
          now: reconciliationNow,
          batchSize: 20,
        }),
      ),
    );
    expect(results.flatMap((result) => result.reconciledRunIds)).toEqual([
      created.run.id,
    ]);

    const run = await prisma.aiRun.findUniqueOrThrow({
      where: { id: created.run.id },
    });
    expect(run).toMatchObject({
      status: AiRunStatus.FAILED,
      failureReason: AiRunFailureReason.EXECUTION_LEASE_EXPIRED,
      failureCode: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      executionLeaseId: null,
      executionLeaseExpiresAt: null,
    });
    expect(
      await prisma.aiThread.findUniqueOrThrow({
        where: { id: created.thread.id },
        select: { activeRunId: true },
      }),
    ).toEqual({ activeRunId: null });

    await expect(
      eventService.append({
        authorization,
        runId: run.id,
        executionLeaseId: lease.executionLeaseId,
        type: 'ASSISTANT_TEXT_DELTA',
        data: { messageId: randomUUID(), delta: '过期执行器迟到片段' },
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
    });
  });

  it('取消后的相同幂等重试应复用原消息且只创建一个关联新 Run', async () => {
    const created = await createQueuedRun('验证取消后的普通重试');
    const cancelled = await runService.requestCancellation({
      authorization,
      runId: created.run.id,
    });
    expect(cancelled.status).toBe('CANCELLED');

    const clientRequestId = randomUUID();
    const retries = await Promise.all(
      Array.from({ length: 6 }, () =>
        threadService.retryRun({
          authorization,
          runId: created.run.id,
          clientRequestId,
        }),
      ),
    );
    expect(new Set(retries.map((result) => result.run.id)).size).toBe(1);
    expect(retries.filter((result) => !result.replayed)).toHaveLength(1);
    expect(retries[0].run).toMatchObject({
      status: 'QUEUED',
      retryOfRunId: created.run.id,
      userMessageId: created.message.id,
    });
    expect(retries[0].message.id).toBe(created.message.id);
    expect(
      await prisma.aiRun.count({
        where: { retryOfRunId: created.run.id },
      }),
    ).toBe(1);

    await expect(
      threadService.retryRun({
        authorization,
        runId: retries[0].run.id,
        clientRequestId: randomUUID(),
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_RUN_NOT_RETRYABLE,
    });
  });

  it('真实决策上下文工具、Step、事件与完成终态应形成可补拉审计闭环', async () => {
    const created = await createQueuedRun('这项决策的基础信息是什么');
    const lease = await runLeaseService.claim({
      authorization,
      runId: created.run.id,
      leaseDurationMs: 60_000,
    });
    const toolCallId = 'get-decision-context-e2e';

    const waitingTool = await toolCallService.start({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      toolCallId,
      sequence: 1,
      status: 'WAITING',
      toolName: 'getDecisionContext',
      input: { decisionId: fixture.decisionId },
    });
    const repeatedWaitingTool = await toolCallService.start({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      toolCallId,
      sequence: 1,
      status: 'WAITING',
      toolName: 'getDecisionContext',
      input: { decisionId: fixture.decisionId },
    });
    const runningTool = await toolCallService.start({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      toolCallId,
      sequence: 1,
      status: 'RUNNING',
      toolName: 'getDecisionContext',
      input: { decisionId: fixture.decisionId },
    });
    const lateWaitingTool = await toolCallService.start({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      toolCallId,
      sequence: 1,
      status: 'WAITING',
      toolName: 'getDecisionContext',
      input: { decisionId: fixture.decisionId },
    });
    expect(waitingTool).toMatchObject({ status: 'WAITING', startedAt: null });
    expect(repeatedWaitingTool.id).toBe(waitingTool.id);
    expect(runningTool).toMatchObject({
      id: waitingTool.id,
      status: 'RUNNING',
    });
    expect(runningTool.startedAt).not.toBeNull();
    expect(lateWaitingTool).toMatchObject({
      id: waitingTool.id,
      status: 'RUNNING',
    });
    const decisionContext = await runtimeQueryService.getDecisionContext(
      authorization,
      created.run.id,
      lease.executionLeaseId,
      fixture.decisionId,
    );
    expect(decisionContext).toMatchObject({
      decision: {
        id: fixture.decisionId,
        title: 'AI 租约测试决策',
      },
      project: { id: fixture.projectId },
      sources: [{ sourceId: `decision:${fixture.decisionId}` }],
    });
    await expect(
      runtimeQueryService.getDecisionContext(
        authorization,
        created.run.id,
        lease.executionLeaseId,
        fixture.decisionId + 999_999,
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
    });
    await expect(
      runtimeQueryService.getDecisionContext(
        { ...authorization, userId: fixture.userId + 999_999 },
        created.run.id,
        lease.executionLeaseId,
        fixture.decisionId,
      ),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_RUN_NOT_FOUND });
    await toolCallService.finish({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      toolCallId,
      resultSummary: {
        decisionId: decisionContext.decision.id,
        decisionTitle: decisionContext.decision.title,
        decisionStatus: decisionContext.decision.status,
        projectTitle: decisionContext.project.title,
        areaName: decisionContext.area?.name ?? null,
        participantCount: decisionContext.decision.participantCount,
        sourceIds: decisionContext.sources.map((source) => source.sourceId),
      },
      errorCode: null,
      durationMs: 12,
    });

    const assistantMessageId = randomUUID();
    await eventService.append({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      type: 'ASSISTANT_TEXT_DELTA',
      data: { messageId: assistantMessageId, delta: '已读取真实决策上下文。' },
    });
    await stepService.recordModelStep({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      sequence: 1,
      modelRole: 'standard',
      resolvedModelId: 'mock/decision-agent',
      provider: 'nextnest.mock',
      responseId: 'response-e2e',
      finishReason: 'stop',
      inputTokens: 21,
      outputTokens: 8,
      estimatedCostUsd: 0.00001,
      startedAt: new Date(Date.now() - 20),
      finishedAt: new Date(),
      timeToFirstOutputMs: 10,
    });
    const completed = await runService.complete({
      authorization,
      runId: created.run.id,
      executionLeaseId: lease.executionLeaseId,
      assistantMessageId,
      assistantContent: '已读取真实决策上下文。',
      resolvedModelId: 'mock/decision-agent',
      sourceIds: [`decision:${fixture.decisionId}`],
    });
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      usage: { inputTokens: 21, outputTokens: 8, totalTokens: 29 },
    });

    const eventPage = await runtimeQueryService.getRunEvents(
      authorization,
      created.thread.id,
      created.run.id,
      0,
    );
    expect(eventPage.run.status).toBe('COMPLETED');
    expect(eventPage.events.map((event) => event.sequence)).toEqual([1, 2, 3]);
    expect(
      await prisma.aiToolCall.findUnique({
        where: { runId_toolCallId: { runId: created.run.id, toolCallId } },
      }),
    ).toMatchObject({ status: 'COMPLETED', durationMs: 12 });

    await expect(
      runtimeQueryService.getRunEvents(
        { ...authorization, userId: fixture.userId + 999_999 },
        created.thread.id,
        created.run.id,
        0,
      ),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_RUN_NOT_FOUND });
  });

  it('流中撤权应原子锁定并拒绝部分恢复与迟到租约写入', async () => {
    const unique = randomUUID();
    const privateArea = await prisma.discussionArea.create({
      data: {
        projectId: fixture.projectId,
        createdById: fixture.userId,
        name: `AI 来源依赖私有区-${unique}`,
        type: DiscussionAreaType.PRIVATE,
        members: {
          create: {
            userId: fixture.userId,
            role: DiscussionAreaMemberRole.MEMBER,
          },
        },
      },
    });
    const dependentDecision = await prisma.decision.create({
      data: {
        title: `AI 来源依赖决策-${unique}`,
        projectId: fixture.projectId,
        areaId: privateArea.id,
        creatorId: fixture.userId,
        ownerId: fixture.userId,
        deptId: fixture.departmentId,
      },
    });
    const dependentSourceId = `decision:${dependentDecision.id}`;

    try {
      const initialRequestId = randomUUID();
      const initialContent = '验证流中权限变化';
      const created = await threadService.createInitialRun({
        authorization,
        decisionId: fixture.decisionId,
        content: initialContent,
        clientRequestId: initialRequestId,
        modelRole: 'standard',
      });
      const lease = await runLeaseService.claim({
        authorization,
        runId: created.run.id,
        leaseDurationMs: 60_000,
      });
      await runtimeQueryService.getDecisionContext(
        authorization,
        created.run.id,
        lease.executionLeaseId,
        fixture.decisionId,
      );
      await prisma.aiSourceDependency.create({
        data: {
          runId: created.run.id,
          sourceId: dependentSourceId,
          usage: AiSourceDependencyUsage.TOOL_READ,
        },
      });
      await prisma.$transaction([
        prisma.discussionAreaMember.delete({
          where: {
            areaId_userId: {
              areaId: privateArea.id,
              userId: fixture.userId,
            },
          },
        }),
        prisma.projectMember.delete({
          where: {
            projectId_userId: {
              projectId: fixture.projectId,
              userId: fixture.userId,
            },
          },
        }),
      ]);

      await expect(
        eventService.append({
          authorization,
          runId: created.run.id,
          executionLeaseId: lease.executionLeaseId,
          type: 'ASSISTANT_TEXT_DELTA',
          data: { messageId: randomUUID(), delta: '撤权后的迟到片段' },
        }),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
      });
      expect(
        await prisma.aiThread.findUniqueOrThrow({
          where: { id: created.thread.id },
          select: { scopeState: true, lockReason: true, activeRunId: true },
        }),
      ).toEqual({
        scopeState: 'LOCKED',
        lockReason: 'SCOPE_CHANGED',
        activeRunId: null,
      });
      expect(
        await prisma.aiRun.findUniqueOrThrow({
          where: { id: created.run.id },
          select: {
            status: true,
            cancellationReason: true,
            executionLeaseId: true,
            executionLeaseExpiresAt: true,
          },
        }),
      ).toEqual({
        status: 'CANCELLED',
        cancellationReason: 'SCOPE_CHANGED',
        executionLeaseId: null,
        executionLeaseExpiresAt: null,
      });

      await prisma.projectMember.create({
        data: {
          projectId: fixture.projectId,
          userId: fixture.userId,
          role: ProjectMemberRole.OWNER,
        },
      });
      await expect(
        threadService.createInitialRun({
          authorization,
          decisionId: fixture.decisionId,
          content: initialContent,
          clientRequestId: initialRequestId,
          modelRole: 'standard',
        }),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
      });
      await expect(
        runtimeQueryService.assertAccessibleRun(authorization, created.run.id),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
      });

      await prisma.discussionAreaMember.create({
        data: {
          areaId: privateArea.id,
          userId: fixture.userId,
          role: DiscussionAreaMemberRole.MEMBER,
        },
      });
      await expect(
        runtimeQueryService.assertAccessibleRun(authorization, created.run.id),
      ).resolves.toMatchObject({ threadId: created.thread.id });
      expect(
        await prisma.aiThread.findUniqueOrThrow({
          where: { id: created.thread.id },
          select: { scopeState: true, lockReason: true },
        }),
      ).toEqual({ scopeState: 'ACTIVE', lockReason: null });
      await expect(
        eventService.append({
          authorization,
          runId: created.run.id,
          executionLeaseId: lease.executionLeaseId,
          type: 'ASSISTANT_TEXT_DELTA',
          data: { messageId: randomUUID(), delta: '废租约不得复活' },
        }),
      ).rejects.toMatchObject({
        code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
      });
      expect(
        await prisma.aiEvent.findFirst({
          where: {
            runId: created.run.id,
            type: 'RUN_STATUS_CHANGED',
            payload: { path: ['cancellationReason'], equals: 'SCOPE_CHANGED' },
          },
        }),
      ).not.toBeNull();
    } finally {
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: fixture.projectId,
            userId: fixture.userId,
          },
        },
        create: {
          projectId: fixture.projectId,
          userId: fixture.userId,
          role: ProjectMemberRole.OWNER,
        },
        update: { role: ProjectMemberRole.OWNER },
      });
      await prisma.aiSourceDependency.deleteMany({
        where: { sourceId: dependentSourceId },
      });
      await prisma.decision.delete({ where: { id: dependentDecision.id } });
      await prisma.discussionArea.delete({ where: { id: privateArea.id } });
    }
  });
});
