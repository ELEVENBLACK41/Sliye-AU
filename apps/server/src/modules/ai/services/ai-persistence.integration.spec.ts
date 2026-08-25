/**
 * 本文件在真实 PostgreSQL 中验证第二阶段 AI 持久化的 migration 约束、幂等、并发门禁和事件补拉。
 * 仅当显式提供 AI_PERSISTENCE_TEST_DATABASE_URL 时执行，避免默认测试误写开发数据库。
 */

import { ConfigService } from '@nestjs/config';
import { AI_THREAD_PINNED_MAX } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { DataScope } from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { DecisionContextService } from '../../decisions/services/decision-context.service';
import { DecisionVisibilityService } from '../../decisions/services/decision-visibility.service';
import type { AiPermissionPolicyService } from '../policies/ai-permission-policy';
import { GetDecisionContextToolService } from '../tools/decision/get-decision-context.service';
import { AiAssistantMessageService } from './ai-assistant-message.service';
import { AiEventService } from './ai-event.service';
import {
  AI_RUN_EXECUTION_LEASE_DURATION_MS,
  AiExecutionLeaseService,
} from './ai-execution-lease.service';
import { AiQueueService } from './ai-queue.service';
import { AiRunControlService } from './ai-run-control.service';
import { AiRunService } from './ai-run.service';
import { AiSourceDependencyService } from './ai-source-dependency.service';
import { AiStepService } from './ai-step.service';
import { AiMessageQueryService } from './ai-message-query.service';
import { AiSourceVisibilityService } from './ai-source-visibility.service';
import { AiThreadMetadataService } from './ai-thread-metadata.service';
import { AiThreadPinService } from './ai-thread-pin.service';
import { AiThreadQueryService } from './ai-thread-query.service';
import { AiThreadService } from './ai-thread.service';
import { AiToolCallService } from './ai-tool-call.service';

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
  let assistantMessageService: AiAssistantMessageService;
  let stepService: AiStepService;
  let toolCallService: AiToolCallService;
  let threadQueryService: AiThreadQueryService;
  let threadPinService: AiThreadPinService;
  let messageQueryService: AiMessageQueryService;
  let threadMetadataService: AiThreadMetadataService;
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
    assistantMessageService = new AiAssistantMessageService(
      prisma,
      executionLeaseService,
    );
    const sourceDependencyService = new AiSourceDependencyService(prisma);
    toolCallService = new AiToolCallService(
      prisma,
      eventService,
      executionLeaseService,
      sourceDependencyService,
    );
    stepService = new AiStepService(prisma, executionLeaseService);
    runControlService = new AiRunControlService(
      prisma,
      eventService,
      queueService,
      executionLeaseService,
      assistantMessageService,
      toolCallService,
    );
    threadService = new AiThreadService(
      prisma,
      queueService,
      runControlService,
    );
    runService = new AiRunService(prisma, queueService, executionLeaseService);
    threadQueryService = new AiThreadQueryService(prisma);
    threadPinService = new AiThreadPinService(prisma);
    messageQueryService = new AiMessageQueryService(prisma);
    threadMetadataService = new AiThreadMetadataService(prisma, queueService);
  });

  /**
   * 按外键与 CHECK 约束允许的顺序清空 AI 相关表。
   *
   * 助手消息的 `runId` 受 CHECK 约束不能为空，而删除 Run 会把它置为 NULL，
   * 因此必须先删助手消息，再删 Run，最后删被 Run 以 Restrict 引用的用户消息。
   */
  async function clearAiTables(): Promise<void> {
    await prisma.aiEvent.deleteMany();
    await prisma.aiSourceDependency.deleteMany();
    await prisma.aiToolCall.deleteMany();
    await prisma.aiStep.deleteMany();
    await prisma.aiMessage.deleteMany({ where: { role: 'ASSISTANT' } });
    await prisma.aiRun.deleteMany();
    await prisma.aiMessage.deleteMany();
    await prisma.aiThread.deleteMany();
  }

  /**
   * 开跑前先清空一次：某轮用例中断导致清理没跑完时，
   * 残留数据会让后续每一次运行都失败，这里让测试套件可以自愈。
   */
  beforeAll(async () => {
    await clearAiTables();
  });

  /** 每个用例结束后删除本用例 AI 数据和独立创建的用户，避免测试之间共享状态。 */
  afterEach(async () => {
    await clearAiTables();
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
      orphanQueuedRunCount: 0,
      nextRunIds: [expect.any(String)],
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

  it('重命名与归档不推进最后活动时间，归档会清除固定状态', async () => {
    const ownerUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证元数据变更。',
      idempotencyKey: 'thread-metadata-001',
      modelRole: 'standard',
    });
    // 先让 Run 进入终态：归档要求没有活跃 Run。
    // Run 状态变化本身**应当**推进 updatedAt，因此基准值要在它之后再设定，
    // 否则测的就不是“元数据变更是否推进时间”了。
    await runControlService.requestStop({
      ownerUserId,
      runId: created.runId,
      cancellationReason: 'USER_REQUESTED',
    });
    const originalUpdatedAt = new Date('2026-08-20T08:00:00.000Z');
    await prisma.aiThread.update({
      where: { id: created.threadId },
      data: { updatedAt: originalUpdatedAt },
    });
    await threadPinService.setThreadPinned(ownerUserId, created.threadId, true);

    const renamed = await threadMetadataService.renameThread(
      ownerUserId,
      created.threadId,
      '  重命名  后的   标题  ',
    );
    expect(renamed.title).toBe('重命名 后的 标题');
    expect(renamed.updatedAt).toBe(originalUpdatedAt.toISOString());

    const archived = await threadMetadataService.setThreadArchived(
      ownerUserId,
      created.threadId,
      true,
    );
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.pinnedAt).toBeNull();
    expect(archived.updatedAt).toBe(originalUpdatedAt.toISOString());

    // 重复归档是幂等的，不改变原有归档时间。
    const repeated = await threadMetadataService.setThreadArchived(
      ownerUserId,
      created.threadId,
      true,
    );
    expect(repeated.archivedAt).toBe(archived.archivedAt);

    const restored = await threadMetadataService.setThreadArchived(
      ownerUserId,
      created.threadId,
      false,
    );
    expect(restored.archivedAt).toBeNull();
    // 恢复不会自动重新固定。
    expect(restored.pinnedAt).toBeNull();
  });

  it('存在活跃 Run 时拒绝归档，归档后不再接收新消息', async () => {
    const ownerUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证归档与活跃 Run 的关系。',
      idempotencyKey: 'thread-archive-active-001',
      modelRole: 'standard',
    });

    // 首个 Run 仍在排队，属于活跃 Run，归档必须被拒绝而不是隐式取消它。
    await expect(
      threadMetadataService.setThreadArchived(
        ownerUserId,
        created.threadId,
        true,
      ),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_RUN_ACTIVE });

    await runControlService.requestStop({
      ownerUserId,
      runId: created.runId,
      cancellationReason: 'USER_REQUESTED',
    });
    await threadMetadataService.setThreadArchived(
      ownerUserId,
      created.threadId,
      true,
    );

    // 已归档会话不再接收新输入，避免出现“已归档但有活跃 Run”的矛盾状态。
    await expect(
      threadService.createMessageWithRun({
        ownerUserId,
        threadId: created.threadId,
        message: '归档后不应被接受的消息。',
        idempotencyKey: 'thread-archive-active-message',
        modelRole: 'standard',
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_ARCHIVED });

    // 恢复后可以继续对话。
    await threadMetadataService.setThreadArchived(
      ownerUserId,
      created.threadId,
      false,
    );
    await expect(
      threadService.createMessageWithRun({
        ownerUserId,
        threadId: created.threadId,
        message: '恢复后可以继续发送。',
        idempotencyKey: 'thread-archive-restored-message',
        modelRole: 'standard',
      }),
    ).resolves.toMatchObject({ threadId: created.threadId });
  });

  it('元数据变更只对所有者开放，空标题被拒绝', async () => {
    const ownerUserId = await createTestUser();
    const otherUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证元数据权限。',
      idempotencyKey: 'thread-metadata-scope-001',
      modelRole: 'standard',
    });

    await expect(
      threadMetadataService.renameThread(
        otherUserId,
        created.threadId,
        '新标题',
      ),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_NOT_FOUND });
    await expect(
      threadMetadataService.setThreadArchived(
        otherUserId,
        created.threadId,
        true,
      ),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_NOT_FOUND });
    await expect(
      threadMetadataService.renameThread(ownerUserId, created.threadId, '   '),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
    });
  });

  it('消息历史从最新往前翻页，返回时为时间正序且不重复不漏项', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '消息 0。',
      idempotencyKey: 'message-page-000',
      modelRole: 'standard',
    });
    // 追加若干条用户消息，并让全部消息共享同一创建时间，
    // 这样只有标识兜底才能保证翻页顺序稳定。
    for (let index = 1; index <= 4; index += 1) {
      await threadService.createMessageWithRun({
        ownerUserId,
        threadId: initial.threadId,
        message: `消息 ${index}。`,
        idempotencyKey: `message-page-00${index}`,
        modelRole: 'standard',
      });
    }
    await prisma.aiMessage.updateMany({
      where: { threadId: initial.threadId },
      data: { createdAt: new Date('2026-08-26T09:00:00.000Z') },
    });
    const expectedOrder = await prisma.aiMessage.findMany({
      where: { threadId: initial.threadId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });

    const pages: string[][] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    do {
      const page = await messageQueryService.listMessages(
        ownerUserId,
        initial.threadId,
        { limit: 2, cursor },
      );
      pages.push(page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
      pageCount += 1;
      expect(pageCount).toBeLessThanOrEqual(10);
    } while (cursor);

    // 每一页内部是正序；页与页之间从最新往更早推进，因此整体需要反向拼接。
    const collected = [...pages].reverse().flat();
    expect(collected).toEqual(expectedOrder.map((message) => message.id));
    expect(new Set(collected).size).toBe(expectedOrder.length);
  });

  it('助手消息带出所属 Run 状态与工具调用，但不返回工具输入输出', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证消息展示数据。',
      idempotencyKey: 'message-run-view-001',
      modelRole: 'standard',
    });
    const lease = await runService.claimQueuedRun(initial.runId);
    const assistant = await assistantMessageService.ensureAssistantMessage({
      runId: initial.runId,
      executionLeaseId: lease!.executionLeaseId,
    });
    const toolCall = await toolCallService.startToolCall({
      runId: initial.runId,
      executionLeaseId: lease!.executionLeaseId,
      providerToolCallId: 'provider-view-1',
      toolName: 'findDecisionCandidates',
      input: { query: '不应出现在历史接口中的输入' },
    });
    await toolCallService.settleToolCall({
      runId: initial.runId,
      executionLeaseId: lease!.executionLeaseId,
      toolCallId: toolCall.toolCallId,
      status: 'SUCCEEDED',
      outputSummary: { secret: '不应出现在历史接口中的业务输出' },
      failureCode: null,
      failureReason: null,
      sources: [],
      durationMs: 12,
    });

    const page = await messageQueryService.listMessages(
      ownerUserId,
      initial.threadId,
      {},
    );
    const assistantItem = page.items.find(
      (item) => item.id === assistant.messageId,
    );
    expect(assistantItem?.run).toMatchObject({
      runId: initial.runId,
      status: 'RUNNING',
      toolCalls: [
        {
          id: toolCall.toolCallId,
          toolName: 'findDecisionCandidates',
          status: 'SUCCEEDED',
          durationMs: 12,
        },
      ],
    });
    // 工具输入与输出承载真实业务事实，在来源失权投影落地前不得经历史接口泄漏。
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain('不应出现在历史接口中的输入');
    expect(serialized).not.toContain('不应出现在历史接口中的业务输出');

    // 用户消息没有 Run 快照。
    const userItem = page.items.find((item) => item.role === 'USER');
    expect(userItem?.run).toBeNull();
  });

  it('消息历史只对会话所有者可见，游标不能跨会话复用', async () => {
    const ownerUserId = await createTestUser();
    const otherUserId = await createTestUser();
    const first = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '会话一。',
      idempotencyKey: 'message-scope-001',
      modelRole: 'standard',
    });
    const second = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '会话二。',
      idempotencyKey: 'message-scope-002',
      modelRole: 'standard',
    });

    await expect(
      messageQueryService.listMessages(otherUserId, first.threadId, {}),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_NOT_FOUND });

    const firstPage = await messageQueryService.listMessages(
      ownerUserId,
      first.threadId,
      { limit: 1 },
    );
    // 会话一还有更早消息时才会给出游标；这里构造一个可用游标再跨会话使用。
    const reusableCursor = firstPage.nextCursor;
    if (reusableCursor) {
      await expect(
        messageQueryService.listMessages(ownerUserId, second.threadId, {
          cursor: reusableCursor,
        }),
      ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_CURSOR_INVALID });
    }
  });

  it('置顶写入是幂等的，且不会改变会话的最后活动时间', async () => {
    const ownerUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证置顶幂等。',
      idempotencyKey: 'thread-pin-idempotent-001',
      modelRole: 'standard',
    });
    const originalUpdatedAt = new Date('2026-08-20T08:00:00.000Z');
    await prisma.aiThread.update({
      where: { id: created.threadId },
      data: { updatedAt: originalUpdatedAt },
    });

    const pinned = await threadPinService.setThreadPinned(
      ownerUserId,
      created.threadId,
      true,
    );
    expect(pinned.pinnedAt).not.toBeNull();
    // 置顶不是会话内容变化，取消置顶后不应该凭空跳到“最近”列表最前面。
    expect(pinned.updatedAt).toBe(originalUpdatedAt.toISOString());

    // 重复置顶不改变原有固定时间，也不报错。
    const repeated = await threadPinService.setThreadPinned(
      ownerUserId,
      created.threadId,
      true,
    );
    expect(repeated.pinnedAt).toBe(pinned.pinnedAt);

    const unpinned = await threadPinService.setThreadPinned(
      ownerUserId,
      created.threadId,
      false,
    );
    expect(unpinned.pinnedAt).toBeNull();
    expect(unpinned.updatedAt).toBe(originalUpdatedAt.toISOString());
  });

  it('并发置顶不会突破固定数量上限', async () => {
    const ownerUserId = await createTestUser();
    const threadIds: string[] = [];
    for (let index = 0; index < AI_THREAD_PINNED_MAX + 3; index += 1) {
      const created = await threadService.createThreadWithInitialRun({
        ownerUserId,
        message: `并发置顶会话 ${index}。`,
        idempotencyKey: `thread-pin-limit-${index}`,
        modelRole: 'standard',
      });
      threadIds.push(created.threadId);
    }

    // 全部同时置顶：只有上限内的请求可以成功，其余必须稳定失败。
    const results = await Promise.allSettled(
      threadIds.map((threadId) =>
        threadPinService.setThreadPinned(ownerUserId, threadId, true),
      ),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(3);
    for (const result of rejected) {
      expect(result.reason).toMatchObject({
        code: API_ERROR_CODES.AI_THREAD_PINNED_LIMIT_EXCEEDED,
      });
    }

    await expect(
      prisma.aiThread.count({
        where: { ownerUserId, pinnedAt: { not: null } },
      }),
    ).resolves.toBe(AI_THREAD_PINNED_MAX);
    const pinnedList = await threadPinService.listPinnedThreads(ownerUserId);
    expect(pinnedList.items).toHaveLength(AI_THREAD_PINNED_MAX);
    expect(pinnedList.limit).toBe(AI_THREAD_PINNED_MAX);
  });

  it('已归档会话不能被固定，非所有者不能改变固定状态', async () => {
    const ownerUserId = await createTestUser();
    const otherUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证归档与置顶互斥。',
      idempotencyKey: 'thread-pin-archived-001',
      modelRole: 'standard',
    });
    await prisma.aiThread.update({
      where: { id: created.threadId },
      data: { archivedAt: new Date() },
    });

    await expect(
      threadPinService.setThreadPinned(ownerUserId, created.threadId, true),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_ARCHIVED });
    await expect(
      threadPinService.setThreadPinned(otherUserId, created.threadId, true),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_NOT_FOUND });
    await expect(
      threadPinService.listPinnedThreads(ownerUserId),
    ).resolves.toMatchObject({ items: [] });
  });

  it('同一最后活动时间的多条会话翻页不重复不漏项，且排除已固定会话', async () => {
    const ownerUserId = await createTestUser();
    const createdThreadIds: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const created = await threadService.createThreadWithInitialRun({
        ownerUserId,
        message: `分页稳定性会话 ${index}。`,
        idempotencyKey: `thread-pagination-${index}`,
        modelRole: 'standard',
      });
      createdThreadIds.push(created.threadId);
    }

    // 制造游标最容易出错的场景：全部会话的排序时间完全相同，只能靠标识区分先后。
    const sharedUpdatedAt = new Date('2026-08-25T12:00:00.000Z');
    await prisma.aiThread.updateMany({
      where: { id: { in: createdThreadIds } },
      data: { updatedAt: sharedUpdatedAt },
    });
    // 固定其中一条，它应当从分页列表中消失。
    const pinnedThreadId = createdThreadIds[0];
    await prisma.aiThread.update({
      where: { id: pinnedThreadId },
      data: { pinnedAt: new Date() },
    });

    const visitedThreadIds: string[] = [];
    let cursor: string | undefined;
    let pageCount = 0;
    do {
      const page = await threadQueryService.listThreads(ownerUserId, {
        limit: 2,
        cursor,
      });
      visitedThreadIds.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
      pageCount += 1;
      expect(pageCount).toBeLessThanOrEqual(10);
    } while (cursor);

    const expectedThreadIds = createdThreadIds.filter(
      (threadId) => threadId !== pinnedThreadId,
    );
    expect(visitedThreadIds).toHaveLength(expectedThreadIds.length);
    expect(new Set(visitedThreadIds).size).toBe(expectedThreadIds.length);
    expect([...visitedThreadIds].sort()).toEqual([...expectedThreadIds].sort());
  });

  it('会话详情只对所有者可见，并返回非终态活跃 Run 快照', async () => {
    const ownerUserId = await createTestUser();
    const otherUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证详情权限。',
      idempotencyKey: 'thread-detail-001',
      modelRole: 'standard',
    });

    await expect(
      threadQueryService.getThreadDetail(ownerUserId, created.threadId),
    ).resolves.toMatchObject({
      id: created.threadId,
      pinnedAt: null,
      archivedAt: null,
      activeRun: { runId: created.runId, status: 'QUEUED' },
    });

    // 非所有者不得区分“无权”与“不存在”。
    await expect(
      threadQueryService.getThreadDetail(otherUserId, created.threadId),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_NOT_FOUND });
    await expect(
      threadQueryService.getThreadDetail(ownerUserId, 'thread-does-not-exist'),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_THREAD_NOT_FOUND });
  });

  it('从未被领取的孤儿排队 Run 会在宽限期后被对账重新交回派发', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证调度回调丢失后的恢复。',
      idempotencyKey: 'orphan-queued-run-001',
      modelRole: 'standard',
    });

    // 刚创建的排队 Run 仍在宽限期内，不应该被判定为孤儿。
    await expect(
      runControlService.reconcileExpiredRuns(),
    ).resolves.toMatchObject({
      orphanQueuedRunCount: 0,
      nextRunIds: [],
    });

    // 模拟调度回调随进程重启丢失：Run 一直是 QUEUED 且没有任何执行租约。
    await prisma.aiRun.update({
      where: { id: initial.runId },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });

    await expect(
      runControlService.reconcileExpiredRuns(),
    ).resolves.toMatchObject({
      reconciledRunCount: 0,
      orphanQueuedRunCount: 1,
      nextRunIds: [initial.runId],
    });
    // 对账只负责重新派发，不改动 Run 状态，领取仍由执行器原子完成。
    await expect(
      prisma.aiRun.findUnique({
        where: { id: initial.runId },
        select: { status: true, executionLeaseId: true },
      }),
    ).resolves.toEqual({ status: 'QUEUED', executionLeaseId: null });
    await expect(
      runService.claimQueuedRun(initial.runId),
    ).resolves.not.toBeNull();
  });

  it('模型步骤关联工具调用，Run 终态会收敛遗留的运行中工具审计', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证工具审计收敛。',
      idempotencyKey: 'tool-audit-settlement-001',
      modelRole: 'standard',
    });
    const lease = await runService.claimQueuedRun(initial.runId);
    expect(lease).not.toBeNull();
    const settledCall = await toolCallService.startToolCall({
      runId: initial.runId,
      executionLeaseId: lease!.executionLeaseId,
      providerToolCallId: 'provider-tool-settled',
      toolName: 'findDecisionCandidates',
      input: { query: '测试' },
    });
    expect(settledCall.state).toBe('CREATED');
    await toolCallService.settleToolCall({
      runId: initial.runId,
      executionLeaseId: lease!.executionLeaseId,
      toolCallId: settledCall.toolCallId,
      status: 'SUCCEEDED',
      outputSummary: { candidates: [] },
      failureCode: null,
      failureReason: null,
      sources: [],
      durationMs: 1,
    });
    const step = await stepService.recordStep({
      runId: initial.runId,
      executionLeaseId: lease!.executionLeaseId,
      sequence: 1,
      resolvedModelId: 'test/model',
      finishReason: 'tool-calls',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      startedAt: new Date(),
      finishedAt: new Date(),
      providerToolCallIds: ['provider-tool-settled'],
    });
    await expect(
      prisma.aiToolCall.findUnique({
        where: { id: settledCall.toolCallId },
        select: { stepId: true },
      }),
    ).resolves.toEqual({ stepId: step.stepId });

    // 同一模型调用标识重放时直接返回已持久化结果，不重复执行业务查询。
    await expect(
      toolCallService.startToolCall({
        runId: initial.runId,
        executionLeaseId: lease!.executionLeaseId,
        providerToolCallId: 'provider-tool-settled',
        toolName: 'findDecisionCandidates',
        input: { query: '测试' },
      }),
    ).resolves.toMatchObject({
      state: 'REPLAY_SUCCEEDED',
      toolCallId: settledCall.toolCallId,
      output: { candidates: [] },
    });

    const runningCall = await toolCallService.startToolCall({
      runId: initial.runId,
      executionLeaseId: lease!.executionLeaseId,
      providerToolCallId: 'provider-tool-running',
      toolName: 'getDecisionContext',
      input: { decisionId: 1 },
    });
    await runControlService.requestStop({
      ownerUserId,
      runId: initial.runId,
      cancellationReason: 'USER_REQUESTED',
    });
    await runControlService.confirmCancellation(ownerUserId, initial.runId);

    const failedToolCall = await prisma.aiToolCall.findUnique({
      where: { id: runningCall.toolCallId },
      select: { status: true, failureCode: true, finishedAt: true },
    });
    expect(failedToolCall).toMatchObject({
      status: 'FAILED',
      failureCode: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
    });
    expect(failedToolCall?.finishedAt).toBeInstanceOf(Date);

    // 租约已失效的旧执行器不得再把已登记的工具结果读回模型。
    await expect(
      toolCallService.startToolCall({
        runId: initial.runId,
        executionLeaseId: lease!.executionLeaseId,
        providerToolCallId: 'provider-tool-settled',
        toolName: 'findDecisionCandidates',
        input: { query: '测试' },
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
    });
  });

  it('来源失权后对应 Run 被判定为不可见，权限恢复后自动重新可见', async () => {
    const ownerUserId = await createTestUser();
    const department = await prisma.department.create({
      data: {
        code: `AI-VISIBILITY-${randomUUID()}`,
        name: 'AI 来源可见性测试部门',
      },
    });
    const project = await prisma.project.create({
      data: {
        title: 'AI 来源可见性测试项目',
        createdById: ownerUserId,
        deptId: department.id,
        members: { create: { userId: ownerUserId } },
      },
    });
    const decision = await prisma.decision.create({
      data: {
        title: 'AI 来源可见性测试决策',
        projectId: project.id,
        creatorId: ownerUserId,
        deptId: department.id,
      },
    });
    const authorization: AuthorizationContext = {
      userId: ownerUserId,
      deptId: null,
      isSuperAdmin: false,
      roleCodes: new Set(),
      deniedPermissions: new Set(),
      grants: new Map([['decision:read', new Set([DataScope.ALL])]]),
    };
    const visibilityService = new AiSourceVisibilityService(
      prisma,
      new DecisionVisibilityService(prisma, new AuthorizationService(prisma)),
    );

    try {
      const withSource = await threadService.createThreadWithInitialRun({
        ownerUserId,
        message: '依赖决策来源的会话。',
        idempotencyKey: 'source-visibility-001',
        modelRole: 'standard',
      });
      const withoutSource = await threadService.createThreadWithInitialRun({
        ownerUserId,
        message: '没有登记任何来源的会话。',
        idempotencyKey: 'source-visibility-002',
        modelRole: 'standard',
      });
      await prisma.aiSourceDependency.create({
        data: {
          runId: withSource.runId,
          sourceType: 'DECISION',
          sourceId: String(decision.id),
          usage: 'READ',
          label: decision.title,
        },
      });
      const runIds = [withSource.runId, withoutSource.runId];

      // 有权限时两个 Run 都可见；没有来源依赖的 Run 不受影响。
      await expect(
        visibilityService.evaluateRunsSourceVisibility(authorization, runIds),
      ).resolves.toEqual(
        new Map([
          [withSource.runId, true],
          [withoutSource.runId, true],
        ]),
      );

      // 撤销项目成员身份，决策随之退出可见范围。
      await prisma.projectMember.deleteMany({
        where: { projectId: project.id, userId: ownerUserId },
      });
      await expect(
        visibilityService.evaluateRunsSourceVisibility(authorization, runIds),
      ).resolves.toEqual(
        new Map([
          [withSource.runId, false],
          [withoutSource.runId, true],
        ]),
      );

      // 权限恢复后判定实时回到可见，不需要任何显式重评（D2-07 选择 A）。
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: ownerUserId },
      });
      await expect(
        visibilityService.evaluateRunsSourceVisibility(authorization, runIds),
      ).resolves.toEqual(
        new Map([
          [withSource.runId, true],
          [withoutSource.runId, true],
        ]),
      );

      // 无法解析的来源标识按 fail closed 判定为不可见，不会因解析失败而放行。
      await prisma.aiSourceDependency.create({
        data: {
          runId: withoutSource.runId,
          sourceType: 'DECISION',
          sourceId: 'not-a-number',
          usage: 'READ',
          label: '无法解析的来源',
        },
      });
      await expect(
        visibilityService.evaluateRunsSourceVisibility(authorization, [
          withoutSource.runId,
        ]),
      ).resolves.toEqual(new Map([[withoutSource.runId, false]]));
    } finally {
      await clearAiTables();
      await prisma.decision.deleteMany({ where: { id: decision.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
      await prisma.department.deleteMany({ where: { id: department.id } });
    }
  });

  it('执行中撤销项目成员身份后，后续决策上下文工具调用被实时拒绝', async () => {
    const ownerUserId = await createTestUser();
    const department = await prisma.department.create({
      data: {
        code: `AI-REVOKE-${randomUUID()}`,
        name: 'AI 撤权测试部门',
      },
    });
    const project = await prisma.project.create({
      data: {
        title: 'AI 撤权测试项目',
        createdById: ownerUserId,
        deptId: department.id,
        members: { create: { userId: ownerUserId } },
      },
    });
    const decision = await prisma.decision.create({
      data: {
        title: 'AI 执行中撤权测试决策',
        projectId: project.id,
        creatorId: ownerUserId,
        deptId: department.id,
      },
    });
    const authorization: AuthorizationContext = {
      userId: ownerUserId,
      deptId: null,
      isSuperAdmin: false,
      roleCodes: new Set(),
      deniedPermissions: new Set(),
      grants: new Map([
        ['ai:chat:use', new Set([DataScope.ALL])],
        ['decision:read', new Set([DataScope.ALL])],
      ]),
    };
    const permissionPolicy = {
      buildAuthorizationContext: jest.fn().mockResolvedValue(authorization),
    } as unknown as AiPermissionPolicyService;
    const contextService = new DecisionContextService(
      prisma,
      new AuthorizationService(prisma),
    );
    const tool = new GetDecisionContextToolService(
      permissionPolicy,
      contextService,
    );
    const executionContext = {
      runId: 'permission-revocation-run',
      threadId: 'permission-revocation-thread',
      ownerUserId,
      executionLeaseId: 'permission-revocation-lease',
      executionLeaseExpiresAt: new Date(Date.now() + 30_000),
    };

    try {
      await expect(
        tool.execute(executionContext, { decisionId: decision.id }),
      ).resolves.toMatchObject({
        output: { decisionId: decision.id },
      });
      await prisma.projectMember.delete({
        where: {
          projectId_userId: { projectId: project.id, userId: ownerUserId },
        },
      });
      await expect(
        tool.execute(executionContext, { decisionId: decision.id }),
      ).rejects.toMatchObject({ code: API_ERROR_CODES.DECISION_NOT_FOUND });
    } finally {
      await prisma.decision.deleteMany({ where: { id: decision.id } });
      await prisma.project.deleteMany({ where: { id: project.id } });
      await prisma.department.deleteMany({ where: { id: department.id } });
    }
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
