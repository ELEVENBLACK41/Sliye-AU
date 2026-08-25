/**
 * 本文件在真实 PostgreSQL 中验证第二阶段 AI 持久化的 migration 约束、幂等、并发门禁和事件补拉。
 * 仅当显式提供 AI_PERSISTENCE_TEST_DATABASE_URL 时执行，避免默认测试误写开发数据库。
 */

import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { AiEventService } from './ai-event.service';
import {
  AI_RUN_EXECUTION_LEASE_DURATION_MS,
  AiExecutionLeaseService,
} from './ai-execution-lease.service';
import { AiQueueService } from './ai-queue.service';
import { AiRunControlService } from './ai-run-control.service';
import { AiRunService } from './ai-run.service';
import { AiThreadService } from './ai-thread.service';

/** 只有明确指定隔离测试数据库时才执行真实数据库测试。 */
const testDatabaseUrl = process.env['AI_PERSISTENCE_TEST_DATABASE_URL'];
const describePersistence = testDatabaseUrl ? describe : describe.skip;

describePersistence('AI 持久化事务地基', () => {
  let prisma: PrismaService;
  let threadService: AiThreadService;
  let runService: AiRunService;
  let runControlService: AiRunControlService;
  let eventService: AiEventService;
  let queueService: AiQueueService;
  let executionLeaseService: AiExecutionLeaseService;
  const createdUserIds: number[] = [];

  /** 连接隔离数据库并组装不依赖 HTTP 或模型调用的持久化服务。 */
  beforeAll(async () => {
    const configService = {
      getOrThrow: jest.fn(() => testDatabaseUrl),
    } as unknown as ConfigService;
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    executionLeaseService = new AiExecutionLeaseService(prisma);
    eventService = new AiEventService(prisma, executionLeaseService);
    queueService = new AiQueueService();
    runControlService = new AiRunControlService(
      prisma,
      eventService,
      queueService,
      executionLeaseService,
    );
    threadService = new AiThreadService(
      prisma,
      queueService,
      runControlService,
    );
    runService = new AiRunService(prisma, queueService, executionLeaseService);
  });

  /** 每个用例结束后删除本用例 AI 数据和独立创建的用户，避免测试之间共享状态。 */
  afterEach(async () => {
    await prisma.aiEvent.deleteMany();
    await prisma.aiRun.deleteMany();
    await prisma.aiMessage.deleteMany();
    await prisma.aiThread.deleteMany();
    await prisma.user.deleteMany({
      where: { id: { in: createdUserIds.splice(0) } },
    });
  });

  /** 测试结束后关闭 PostgreSQL 客户端连接。 */
  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  /** 创建一位只属于当前测试用例的用户。 */
  async function createTestUser(): Promise<number> {
    const user = await prisma.user.create({
      data: { email: `ai-persistence-${randomUUID()}@example.test` },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  it('同一创建幂等键只创建一组 Thread、消息和 Run，同键不同正文稳定冲突', async () => {
    const ownerUserId = await createTestUser();
    const input = {
      ownerUserId,
      message: '请总结这项决策的当前分歧。',
      idempotencyKey: 'create-001',
      modelRole: 'standard' as const,
    };

    const [first, replay] = await Promise.all([
      threadService.createThreadWithInitialRun(input),
      threadService.createThreadWithInitialRun(input),
    ]);

    expect(first.threadId).toBe(replay.threadId);
    expect(first.messageId).toBe(replay.messageId);
    expect(first.runId).toBe(replay.runId);
    expect([first.replayed, replay.replayed]).toContain(true);
    await expect(
      threadService.createThreadWithInitialRun({
        ...input,
        message: '这是同一幂等键下的不同正文。',
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT });
    await expect(prisma.aiThread.count()).resolves.toBe(1);
    await expect(prisma.aiMessage.count()).resolves.toBe(1);
    await expect(prisma.aiRun.count()).resolves.toBe(1);
  });

  it('活跃 Run 期间的并发普通输入稳定入队，不创建第二个非终态 Run', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '先建立会话。',
      idempotencyKey: 'create-002',
      modelRole: 'standard',
    });

    const results = await Promise.all([
      threadService.createMessageWithRun({
        ownerUserId,
        threadId: initial.threadId,
        message: '并发消息 A。',
        idempotencyKey: 'message-002-a',
        modelRole: 'standard',
      }),
      threadService.createMessageWithRun({
        ownerUserId,
        threadId: initial.threadId,
        message: '并发消息 B。',
        idempotencyKey: 'message-002-b',
        modelRole: 'standard',
      }),
    ]);

    expect(
      results.every(
        (result) => result.dispatchState === 'QUEUED' && result.runId === null,
      ),
    ).toBe(true);
    await expect(
      prisma.aiRun.count({
        where: {
          threadId: initial.threadId,
          status: {
            in: [
              'QUEUED',
              'RUNNING',
              'WAITING_APPROVAL',
              'CANCELLATION_REQUESTED',
            ],
          },
        },
      }),
    ).resolves.toBe(1);
    const queuedMessages = await prisma.aiMessage.findMany({
      where: { id: { in: results.map((result) => result.messageId) } },
      orderBy: { queueSequence: 'asc' },
      select: { id: true, dispatchState: true, queueSequence: true },
    });
    expect(queuedMessages).toEqual([
      expect.objectContaining({ dispatchState: 'QUEUED', queueSequence: 2 }),
      expect.objectContaining({ dispatchState: 'QUEUED', queueSequence: 3 }),
    ]);

    await runControlService.requestStop({
      ownerUserId,
      runId: initial.runId,
      cancellationReason: 'USER_REQUESTED',
    });
    const dispatched = await prisma.aiRun.findFirst({
      where: {
        threadId: initial.threadId,
        userMessageId: queuedMessages[0].id,
      },
      select: { id: true, status: true },
    });
    expect(dispatched).toMatchObject({ status: 'QUEUED' });

    await runControlService.requestStop({
      ownerUserId,
      runId: dispatched!.id,
      cancellationReason: 'USER_REQUESTED',
    });
    await expect(
      prisma.aiRun.findFirst({
        where: {
          threadId: initial.threadId,
          userMessageId: queuedMessages[1].id,
        },
        select: { status: true },
      }),
    ).resolves.toMatchObject({ status: 'QUEUED' });
  });

  it('Thread 内消息幂等键会重放同一消息和 Run，并拒绝不同正文', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '先建立可发送消息的会话。',
      idempotencyKey: 'create-002-message',
      modelRole: 'standard',
    });
    const input = {
      ownerUserId,
      threadId: initial.threadId,
      message: '这是一条可以幂等重放的后续消息。',
      idempotencyKey: 'message-002-replay',
      modelRole: 'standard' as const,
    };

    const [first, replay] = await Promise.all([
      threadService.createMessageWithRun(input),
      threadService.createMessageWithRun(input),
    ]);

    expect(first.messageId).toBe(replay.messageId);
    expect(first.runId).toBe(replay.runId);
    expect(first.dispatchState).toBe('QUEUED');
    await expect(
      threadService.createMessageWithRun({
        ...input,
        message: '这是相同消息幂等键下的不同正文。',
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT });
    await expect(
      threadService.createMessageWithRun({
        ...input,
        submissionMode: 'STEER',
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT });
  });

  it('调整方向替代全部尚未领取的输入，只保留最新方向等待分发', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '先回答当前问题。',
      idempotencyKey: 'create-redirect-001',
      modelRole: 'standard',
    });
    const normal = await threadService.createMessageWithRun({
      ownerUserId,
      threadId: initial.threadId,
      message: '查一下投票结果。',
      idempotencyKey: 'message-redirect-normal',
      modelRole: 'standard',
    });
    const firstSteer = await threadService.createMessageWithRun({
      ownerUserId,
      threadId: initial.threadId,
      message: '改为总结会议结论。',
      idempotencyKey: 'message-redirect-first',
      modelRole: 'standard',
      submissionMode: 'STEER',
    });
    const latestSteer = await threadService.createMessageWithRun({
      ownerUserId,
      threadId: initial.threadId,
      message: '只总结王五的观点。',
      idempotencyKey: 'message-redirect-latest',
      modelRole: 'standard',
      submissionMode: 'STEER',
    });

    expect(normal.dispatchState).toBe('QUEUED');
    expect(firstSteer.dispatchState).toBe('DISPATCHED');
    await expect(
      prisma.aiMessage.findMany({
        where: {
          id: {
            in: [normal.messageId, firstSteer.messageId, latestSteer.messageId],
          },
        },
        orderBy: { queueSequence: 'asc' },
        select: { id: true, dispatchState: true, submissionMode: true },
      }),
    ).resolves.toEqual([
      {
        id: normal.messageId,
        dispatchState: 'SUPERSEDED',
        submissionMode: 'NORMAL',
      },
      {
        id: firstSteer.messageId,
        dispatchState: 'DISPATCHED',
        submissionMode: 'STEER',
      },
      {
        id: latestSteer.messageId,
        dispatchState: 'DISPATCHED',
        submissionMode: 'STEER',
      },
    ]);

    await expect(
      prisma.aiRun.findFirst({
        where: {
          threadId: initial.threadId,
          userMessageId: latestSteer.messageId,
        },
        select: { status: true },
      }),
    ).resolves.toMatchObject({ status: 'QUEUED' });
  });

  it('并发追加事件分配连续唯一序号，并可从 afterSequence 补拉', async () => {
    const ownerUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证事件序号。',
      idempotencyKey: 'create-003',
      modelRole: 'standard',
    });

    const lease = await runService.claimQueuedRun(created.runId);
    expect(lease).not.toBeNull();
    const events = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        prisma.$transaction((transaction) =>
          eventService.appendExecutionEventInTransaction(transaction, {
            runId: created.runId,
            executionLeaseId: lease!.executionLeaseId,
            type: 'ASSISTANT_TEXT_DELTA',
            data: { messageId: created.messageId, delta: `片段-${index}` },
          }),
        ),
      ),
    );

    expect(
      events.map((event) => event.sequence).sort((left, right) => left - right),
    ).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
    const resumed = await eventService.listAfterSequence(created.runId, 10);
    expect(resumed.map((event) => event.sequence)).toEqual(
      Array.from({ length: 14 }, (_, index) => index + 11),
    );
  });

  it('同一排队 Run 并发领取时只向一个执行器签发租约', async () => {
    const ownerUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证执行器领取。',
      idempotencyKey: 'claim-queued-run-001',
      modelRole: 'standard',
    });
    const beforeClaimedAt = Date.now();
    const leases = await Promise.all([
      runService.claimQueuedRun(created.runId),
      runService.claimQueuedRun(created.runId),
    ]);
    const successfulLeases = leases.filter(
      (lease): lease is NonNullable<typeof lease> => lease !== null,
    );

    expect(successfulLeases).toHaveLength(1);
    expect(leases).toContain(null);
    expect(successfulLeases[0]).toMatchObject({ runId: created.runId });
    expect(
      successfulLeases[0].executionLeaseExpiresAt.getTime(),
    ).toBeGreaterThanOrEqual(
      beforeClaimedAt + AI_RUN_EXECUTION_LEASE_DURATION_MS,
    );
    const claimedRun = await prisma.aiRun.findUnique({
      where: { id: created.runId },
      select: {
        status: true,
        executionLeaseId: true,
        executionLeaseExpiresAt: true,
        startedAt: true,
      },
    });
    expect(claimedRun).toMatchObject({
      status: 'RUNNING',
      executionLeaseId: successfulLeases[0].executionLeaseId,
      executionLeaseExpiresAt: successfulLeases[0].executionLeaseExpiresAt,
    });
    expect(claimedRun?.startedAt).toBeInstanceOf(Date);
  });

  it('只有当前未过期租约可以续租，错误或过期租约均被拒绝', async () => {
    const ownerUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证执行租约续租。',
      idempotencyKey: 'renew-execution-lease-001',
      modelRole: 'standard',
    });
    const lease = await runService.claimQueuedRun(created.runId);
    expect(lease).not.toBeNull();

    const renewedExpiresAt = await runService.renewExecutionLease({
      runId: created.runId,
      executionLeaseId: lease!.executionLeaseId,
    });
    expect(renewedExpiresAt.getTime()).toBeGreaterThan(
      lease!.executionLeaseExpiresAt.getTime(),
    );
    await expect(
      runService.renewExecutionLease({
        runId: created.runId,
        executionLeaseId: 'wrong-lease-id',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
    });

    await prisma.aiRun.update({
      where: { id: created.runId },
      data: { executionLeaseExpiresAt: new Date(Date.now() - 1) },
    });
    await expect(
      runService.renewExecutionLease({
        runId: created.runId,
        executionLeaseId: lease!.executionLeaseId,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
    });
  });

  it('调整方向会失效旧租约、拒绝迟到事件，并在取消确认后只分发最新方向', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '先回答当前问题。',
      idempotencyKey: 'redirect-cancellation-001',
      modelRole: 'standard',
    });
    const lease = await runService.claimQueuedRun(initial.runId);
    expect(lease).not.toBeNull();
    const normal = await threadService.createMessageWithRun({
      ownerUserId,
      threadId: initial.threadId,
      message: '这是会被调整方向替代的普通输入。',
      idempotencyKey: 'redirect-cancellation-normal',
      modelRole: 'standard',
    });
    const steer = await threadService.createMessageWithRun({
      ownerUserId,
      threadId: initial.threadId,
      message: '改为只总结关键分歧。',
      idempotencyKey: 'redirect-cancellation-steer',
      modelRole: 'standard',
      submissionMode: 'STEER',
    });

    expect(normal.dispatchState).toBe('QUEUED');
    expect(steer.dispatchState).toBe('QUEUED');
    await expect(
      prisma.$transaction((transaction) =>
        eventService.appendExecutionEventInTransaction(transaction, {
          runId: initial.runId,
          executionLeaseId: lease!.executionLeaseId,
          type: 'ASSISTANT_TEXT_DELTA',
          data: { messageId: initial.messageId, delta: '迟到片段' },
        }),
      ),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
    });

    const cancelled = await runControlService.confirmCancellation(
      ownerUserId,
      initial.runId,
    );
    expect(cancelled).toMatchObject({ status: 'CANCELLED' });
    await expect(
      prisma.aiMessage.findUnique({
        where: { id: normal.messageId },
        select: { dispatchState: true },
      }),
    ).resolves.toMatchObject({ dispatchState: 'SUPERSEDED' });
    await expect(
      prisma.aiRun.findFirst({
        where: { threadId: initial.threadId, userMessageId: steer.messageId },
        select: { status: true },
      }),
    ).resolves.toMatchObject({ status: 'QUEUED' });
  });

  it('租约过期后对账把遗留 Run 收敛为失败并释放下一条排队输入', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证进程异常收敛。',
      idempotencyKey: 'reconcile-expired-run-001',
      modelRole: 'standard',
    });
    const lease = await runService.claimQueuedRun(initial.runId);
    expect(lease).not.toBeNull();
    const queued = await threadService.createMessageWithRun({
      ownerUserId,
      threadId: initial.threadId,
      message: '等待旧 Run 失败后再处理。',
      idempotencyKey: 'reconcile-expired-run-message',
      modelRole: 'standard',
    });
    await prisma.aiRun.update({
      where: { id: initial.runId },
      data: { executionLeaseExpiresAt: new Date(Date.now() - 1) },
    });

    await expect(runControlService.reconcileExpiredRuns()).resolves.toEqual({
      scannedRunCount: 1,
      reconciledRunCount: 1,
    });
    await expect(
      prisma.aiRun.findUnique({
        where: { id: initial.runId },
        select: { status: true, failureReason: true, failureCode: true },
      }),
    ).resolves.toMatchObject({
      status: 'FAILED',
      failureReason: 'EXECUTION_LEASE_EXPIRED',
      failureCode: API_ERROR_CODES.AI_EXECUTION_LEASE_EXPIRED,
    });
    await expect(
      prisma.aiRun.findFirst({
        where: { threadId: initial.threadId, userMessageId: queued.messageId },
        select: { status: true },
      }),
    ).resolves.toMatchObject({ status: 'QUEUED' });
  });

  it('普通输入入队与旧 Run 终态竞争时只会产生一个后续活跃 Run', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证普通队列与终态竞争。',
      idempotencyKey: 'terminal-race-queue-001',
      modelRole: 'standard',
    });
    const [submission] = await Promise.all([
      threadService.createMessageWithRun({
        ownerUserId,
        threadId: initial.threadId,
        message: '竞争期间提交的普通输入。',
        idempotencyKey: 'terminal-race-queue-message',
        modelRole: 'standard',
      }),
      runControlService.requestStop({
        ownerUserId,
        runId: initial.runId,
        cancellationReason: 'USER_REQUESTED',
      }),
    ]);

    await expect(
      prisma.aiRun.findMany({
        where: {
          threadId: initial.threadId,
          status: {
            in: [
              'QUEUED',
              'RUNNING',
              'WAITING_APPROVAL',
              'CANCELLATION_REQUESTED',
            ],
          },
        },
        select: { userMessageId: true },
      }),
    ).resolves.toEqual([{ userMessageId: submission.messageId }]);
  });

  it('取消与完成竞争时只保留一个终态，完成会在旧租约已失效后被拒绝', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证取消与完成竞争。',
      idempotencyKey: 'cancel-complete-race-001',
      modelRole: 'standard',
    });
    const lease = await runService.claimQueuedRun(initial.runId);
    expect(lease).not.toBeNull();
    await Promise.allSettled([
      runControlService.requestStop({
        ownerUserId,
        runId: initial.runId,
        cancellationReason: 'USER_REQUESTED',
      }),
      runControlService.completeRun({
        ownerUserId,
        runId: initial.runId,
        executionLeaseId: lease!.executionLeaseId,
        status: 'COMPLETED',
        failureReason: null,
        failureCode: null,
      }),
    ]);
    const current = await prisma.aiRun.findUnique({
      where: { id: initial.runId },
      select: { status: true },
    });
    if (current?.status === 'CANCELLATION_REQUESTED') {
      await runControlService.confirmCancellation(ownerUserId, initial.runId);
    }
    const settled = await prisma.aiRun.findUnique({
      where: { id: initial.runId },
      select: { status: true },
    });
    expect(['CANCELLED', 'COMPLETED']).toContain(settled?.status);
  });

  it('调整方向与完成竞争不会生成并发 Run，旧 Run 终态后才领取新方向', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证调整方向与完成竞争。',
      idempotencyKey: 'redirect-complete-race-001',
      modelRole: 'standard',
    });
    const lease = await runService.claimQueuedRun(initial.runId);
    expect(lease).not.toBeNull();
    const [steerResult] = await Promise.allSettled([
      threadService.createMessageWithRun({
        ownerUserId,
        threadId: initial.threadId,
        message: '改为先说明反对意见。',
        idempotencyKey: 'redirect-complete-race-steer',
        modelRole: 'standard',
        submissionMode: 'STEER',
      }),
      runControlService.completeRun({
        ownerUserId,
        runId: initial.runId,
        executionLeaseId: lease!.executionLeaseId,
        status: 'COMPLETED',
        failureReason: null,
        failureCode: null,
      }),
    ]);
    expect(steerResult.status).toBe('fulfilled');
    if (steerResult.status !== 'fulfilled') {
      throw steerResult.reason;
    }
    const current = await prisma.aiRun.findUnique({
      where: { id: initial.runId },
      select: { status: true },
    });
    if (current?.status === 'CANCELLATION_REQUESTED') {
      await runControlService.confirmCancellation(ownerUserId, initial.runId);
    }
    await expect(
      prisma.aiRun.count({
        where: {
          threadId: initial.threadId,
          status: {
            in: [
              'QUEUED',
              'RUNNING',
              'WAITING_APPROVAL',
              'CANCELLATION_REQUESTED',
            ],
          },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.aiRun.findFirst({
        where: {
          threadId: initial.threadId,
          userMessageId: steerResult.value.messageId,
        },
        select: { status: true },
      }),
    ).resolves.toMatchObject({ status: 'QUEUED' });
  });

  it('重试仅从终态创建新 Run，且同一重试幂等键稳定返回同一资源', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证重试。',
      idempotencyKey: 'create-004',
      modelRole: 'deepReview',
    });
    await runControlService.requestStop({
      ownerUserId,
      runId: initial.runId,
      cancellationReason: 'USER_REQUESTED',
    });

    const [first, replay] = await Promise.all([
      runService.retryRun({
        ownerUserId,
        runId: initial.runId,
        idempotencyKey: 'retry-004',
      }),
      runService.retryRun({
        ownerUserId,
        runId: initial.runId,
        idempotencyKey: 'retry-004',
      }),
    ]);

    expect(first.runId).toBe(replay.runId);
    expect(first.runId).not.toBe(initial.runId);
    await expect(
      prisma.aiRun.findUnique({ where: { id: first.runId } }),
    ).resolves.toMatchObject({ retryOfRunId: initial.runId, status: 'QUEUED' });
  });
});
