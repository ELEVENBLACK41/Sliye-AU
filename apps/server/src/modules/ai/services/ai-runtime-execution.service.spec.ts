/**
 * 本文件验证 Agent Runtime 内部领取入口只使用持久化 Run 生成执行上下文。
 * 不连接数据库、不调用模型或工具。
 */

import { AiLanguageModelRole as PrismaAiLanguageModelRole } from '../../../generated/prisma';
import { AI_RUNTIME_SERVICE_IDENTITY } from '../types/ai-runtime.types';
import { AiRuntimeExecutionService } from './ai-runtime-execution.service';
import { AiRunService } from './ai-run.service';

describe('AiRuntimeExecutionService', () => {
  /** 创建仅覆盖 Runtime 领取边界的服务实例，避免本单元测试访问真实数据库。 */
  function createService() {
    const claimQueuedRun = jest.fn();
    const runService = {
      claimQueuedRun,
    } as unknown as AiRunService;
    const prisma = {
      aiRun: {
        findFirst: jest.fn(),
      },
    };

    return {
      service: new AiRuntimeExecutionService(prisma as never, runService),
      claimQueuedRun,
      runService,
      prisma,
    };
  }

  it('领取成功后仅从持久化 Run 组装当前用户、消息、模型和租约上下文', async () => {
    const { service, claimQueuedRun, prisma } = createService();
    const expiresAt = new Date(Date.now() + 30_000);
    claimQueuedRun.mockResolvedValue({
      runId: 'run-001',
      executionLeaseId: 'lease-001',
      executionLeaseExpiresAt: expiresAt,
    });
    prisma.aiRun.findFirst.mockResolvedValue({
      id: 'run-001',
      threadId: 'thread-001',
      userMessageId: 'message-001',
      modelRole: PrismaAiLanguageModelRole.DEEP_REVIEW,
      executionLeaseId: 'lease-001',
      executionLeaseExpiresAt: expiresAt,
      thread: { ownerUserId: 42 },
      userMessage: { content: '请分析缓存方案。' },
    });

    await expect(
      service.claimExecution({
        serviceIdentity: AI_RUNTIME_SERVICE_IDENTITY,
        runId: 'run-001',
      }),
    ).resolves.toEqual({
      runId: 'run-001',
      threadId: 'thread-001',
      ownerUserId: 42,
      userMessageId: 'message-001',
      userMessageContent: '请分析缓存方案。',
      modelRole: 'deepReview',
      executionLeaseId: 'lease-001',
      executionLeaseExpiresAt: expiresAt,
    });
  });

  it('原子领取失败时不查询 Run 上下文，也不允许启动第二个执行器', async () => {
    const { service, claimQueuedRun, prisma } = createService();
    claimQueuedRun.mockResolvedValue(null);

    await expect(
      service.claimExecution({
        serviceIdentity: AI_RUNTIME_SERVICE_IDENTITY,
        runId: 'run-already-claimed',
      }),
    ).resolves.toBeNull();
    expect(prisma.aiRun.findFirst).not.toHaveBeenCalled();
  });

  it('领取后租约已失效时不返回执行上下文', async () => {
    const { service, claimQueuedRun, prisma } = createService();
    claimQueuedRun.mockResolvedValue({
      runId: 'run-cancelled',
      executionLeaseId: 'invalidated-lease',
      executionLeaseExpiresAt: new Date(Date.now() + 30_000),
    });
    prisma.aiRun.findFirst.mockResolvedValue(null);

    await expect(
      service.claimExecution({
        serviceIdentity: AI_RUNTIME_SERVICE_IDENTITY,
        runId: 'run-cancelled',
      }),
    ).resolves.toBeNull();
  });
});
