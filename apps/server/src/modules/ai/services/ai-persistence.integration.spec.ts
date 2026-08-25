/**
 * 本文件在真实 PostgreSQL 中验证第二阶段 AI 持久化的 migration 约束、幂等、并发门禁和事件补拉。
 * 仅当显式提供 AI_PERSISTENCE_TEST_DATABASE_URL 时执行，避免默认测试误写开发数据库。
 */

import { ConfigService } from '@nestjs/config';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { AiEventService } from './ai-event.service';
import { AiRunService } from './ai-run.service';
import { AiThreadService } from './ai-thread.service';

/** 只有明确指定隔离测试数据库时才执行真实数据库测试。 */
const testDatabaseUrl = process.env['AI_PERSISTENCE_TEST_DATABASE_URL'];
const describePersistence = testDatabaseUrl ? describe : describe.skip;

describePersistence('AI 持久化事务地基', () => {
  let prisma: PrismaService;
  let threadService: AiThreadService;
  let runService: AiRunService;
  let eventService: AiEventService;
  const createdUserIds: number[] = [];

  /** 连接隔离数据库并组装不依赖 HTTP 或模型调用的持久化服务。 */
  beforeAll(async () => {
    const configService = {
      getOrThrow: jest.fn(() => testDatabaseUrl),
    } as unknown as ConfigService;
    prisma = new PrismaService(configService);
    await prisma.onModuleInit();
    eventService = new AiEventService(prisma);
    threadService = new AiThreadService(prisma);
    runService = new AiRunService(prisma, eventService);
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

  it('同一 Thread 的不同并发消息只允许一个非终态 Run', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '先建立会话。',
      idempotencyKey: 'create-002',
      modelRole: 'standard',
    });
    await runService.completeRun({
      ownerUserId,
      runId: initial.runId,
      status: 'CANCELLED',
      cancellationReason: 'USER_REQUESTED',
      failureReason: null,
      failureCode: null,
    });

    const results = await Promise.allSettled([
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
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      reason: { code: API_ERROR_CODES.AI_THREAD_RUN_ACTIVE },
    });
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
  });

  it('Thread 内消息幂等键会重放同一消息和 Run，并拒绝不同正文', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '先建立可发送消息的会话。',
      idempotencyKey: 'create-002-message',
      modelRole: 'standard',
    });
    await runService.completeRun({
      ownerUserId,
      runId: initial.runId,
      status: 'CANCELLED',
      cancellationReason: 'USER_REQUESTED',
      failureReason: null,
      failureCode: null,
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
    await expect(
      threadService.createMessageWithRun({
        ...input,
        message: '这是相同消息幂等键下的不同正文。',
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT });
  });

  it('并发追加事件分配连续唯一序号，并可从 afterSequence 补拉', async () => {
    const ownerUserId = await createTestUser();
    const created = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证事件序号。',
      idempotencyKey: 'create-003',
      modelRole: 'standard',
    });

    const events = await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        prisma.$transaction((transaction) =>
          eventService.appendInTransaction(transaction, {
            runId: created.runId,
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

  it('重试仅从终态创建新 Run，且同一重试幂等键稳定返回同一资源', async () => {
    const ownerUserId = await createTestUser();
    const initial = await threadService.createThreadWithInitialRun({
      ownerUserId,
      message: '验证重试。',
      idempotencyKey: 'create-004',
      modelRole: 'deepReview',
    });
    await runService.completeRun({
      ownerUserId,
      runId: initial.runId,
      status: 'CANCELLED',
      cancellationReason: 'USER_REQUESTED',
      failureReason: null,
      failureCode: null,
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
