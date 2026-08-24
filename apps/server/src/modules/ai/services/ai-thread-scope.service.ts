/**
 * 本文件集中复核 AI Thread 的 Decision 与全部来源依赖，并原子收敛失权运行。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiRunCancellationReason,
  AiRunStatus,
  AiSourceDependencyUsage,
  AiThreadLockReason,
  AiThreadScopeState,
  AiToolCallStatus,
  Prisma,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 当前执行与历史接口共同使用的 Thread 权限快照。 */
export type AiAccessibleThreadScope = {
  /** 已重新鉴权的 Thread UUID。 */
  threadId: string;
  /** 2.6 旧会话的兼容 Decision 主键；新会话为空。 */
  decisionId: number | null;
};

/** Run 执行写入额外需要的稳定定位信息。 */
export type AiAccessibleRunScope = AiAccessibleThreadScope & {
  /** 已重新鉴权的 Run UUID。 */
  runId: string;
  /** 当前 Run 已确认且在本次事务中重新鉴权的决策主键。 */
  decisionIds: number[];
};

/** 新建 Thread 前在同一事务内校验得到的 Decision 绑定信息。 */
export type AiAccessibleDecisionScope = {
  /** 已重新鉴权的 Decision 主键。 */
  decisionId: number;
  /** Decision 当前所属的项目主键。 */
  projectId: number;
  /** 小组级决策所属分区；项目级决策为空。 */
  areaId: number | null;
};

/** 权限事务执行成功或需要在提交锁定后拒绝调用的结果。 */
type AiScopeTransactionOutcome<T> =
  | { kind: 'success'; value: T }
  | { kind: 'not_found' }
  | { kind: 'scope_changed' };

/** 校验 UUID 路径和内部命令字段的稳定文本格式。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 第一版唯一已知来源采用严格的 `decision:<正整数>` 形式。 */
const DECISION_SOURCE_PATTERN = /^decision:([1-9]\d*)$/;
/** 可串行化权限事务遇到并发写冲突时的有限重试上限。 */
const MAX_SCOPE_TRANSACTION_ATTEMPTS = 10;
/** 失权时需要立即收敛的全部非终态 Run。 */
const ACTIVE_RUN_STATUSES = [
  AiRunStatus.QUEUED,
  AiRunStatus.RUNNING,
  AiRunStatus.WAITING_APPROVAL,
  AiRunStatus.CANCELLATION_REQUESTED,
] as const;

/** 权限复核所需的最小 Thread、来源和活跃 Run 数据。 */
const aiThreadScopeSelect = {
  id: true,
  decisionId: true,
  scopeState: true,
  lockReason: true,
  scopeChangedAt: true,
  activeRunId: true,
  activeRun: {
    select: {
      id: true,
      status: true,
      nextEventSequence: true,
    },
  },
  runs: {
    select: {
      sourceDependencies: { select: { sourceId: true } },
      toolCalls: {
        where: { status: AiToolCallStatus.COMPLETED },
        select: { resultSummary: true },
      },
    },
  },
} as const satisfies Prisma.AiThreadSelect;

/** 权限复核事务读取的 Thread 记录。 */
type AiThreadScopeRecord = Prisma.AiThreadGetPayload<{
  select: typeof aiThreadScopeSelect;
}>;

@Injectable()
export class AiThreadScopeService {
  /**
   * 同一进程内按 Run 串联短事务以降低冲突重试；跨实例正确性仍由数据库隔离保证。
   */
  private readonly runTransactionTails = new Map<string, Promise<void>>();

  /** 注入数据库与现有 Decision 对象级授权规则。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 重新校验一个 Run，并在失权时先提交锁定事务再返回稳定错误。 */
  async assertAccessibleRun(
    authorization: AuthorizationContext,
    runId: string,
    candidateSourceIds: readonly string[] = [],
  ): Promise<AiAccessibleRunScope> {
    return this.withAccessibleRun(
      authorization,
      runId,
      candidateSourceIds,
      (_tx, scope) => Promise.resolve(scope),
    );
  }

  /** 重新校验一个 Thread，并在全部依赖恢复后自动解除范围锁定。 */
  async assertAccessibleThread(
    authorization: AuthorizationContext,
    threadId: string,
  ): Promise<AiAccessibleThreadScope> {
    return this.withAccessibleThread(
      authorization,
      threadId,
      [],
      (_tx, scope) => Promise.resolve(scope),
    );
  }

  /** 在同一可串行化事务中复核 Decision 后执行初始 Thread 与 Run 创建。 */
  async withAccessibleDecision<T>(
    authorization: AuthorizationContext,
    decisionId: number,
    action: (
      tx: Prisma.TransactionClient,
      scope: AiAccessibleDecisionScope,
    ) => Promise<T>,
  ): Promise<T> {
    this.assertPermissions(authorization);
    if (!Number.isSafeInteger(decisionId) || decisionId <= 0) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: '决策主键必须是正整数',
        status: HttpStatus.BAD_REQUEST,
        details: [
          {
            field: 'decisionId',
            message: '决策主键必须是正整数',
            rule: 'AI_SCOPE_DECISION_ID_INVALID',
          },
        ],
      });
    }

    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    return this.runSerializableTransaction(async (tx) => {
      const decision = await tx.decision.findFirst({
        where: { AND: [{ id: decisionId }, decisionWhere] },
        select: { id: true, projectId: true, areaId: true },
      });
      if (!decision) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_NOT_FOUND,
          message: '决策不存在或当前账号无权访问',
          status: HttpStatus.NOT_FOUND,
        });
      }

      return action(tx, {
        decisionId: decision.id,
        projectId: decision.projectId,
        areaId: decision.areaId,
      });
    });
  }

  /**
   * 在一次数据库事务中复核 Run、全部既有依赖和本次候选来源后执行受保护操作。
   * 失权分支不抛异常，确保锁定、取消、清门禁与废租约先原子提交。
   */
  async withAccessibleRun<T>(
    authorization: AuthorizationContext,
    runId: string,
    candidateSourceIds: readonly string[],
    action: (
      tx: Prisma.TransactionClient,
      scope: AiAccessibleRunScope,
    ) => Promise<T>,
  ): Promise<T> {
    this.assertPermissions(authorization);
    this.assertUuid(runId, 'runId');
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const outcome = await this.runTransactionByRun(runId, () =>
      this.runSerializableTransaction<AiScopeTransactionOutcome<T>>(
        async (tx) => {
          const run = await tx.aiRun.findFirst({
            where: {
              id: runId,
              thread: { ownerUserId: authorization.userId },
            },
            select: {
              id: true,
              decisionScopes: { select: { decisionId: true } },
              thread: { select: aiThreadScopeSelect },
            },
          });
          if (!run) {
            return { kind: 'not_found' };
          }

          const accessible = await this.isThreadScopeAccessible(
            tx,
            decisionWhere,
            run.thread,
            [
              ...candidateSourceIds,
              ...run.decisionScopes.map(
                (scope) => `decision:${scope.decisionId}`,
              ),
            ],
          );
          if (!accessible) {
            await this.lockThreadScope(tx, run.thread);
            return { kind: 'scope_changed' };
          }

          await this.unlockThreadScope(tx, run.thread);
          return {
            kind: 'success',
            value: await action(tx, {
              runId: run.id,
              threadId: run.thread.id,
              decisionId: run.thread.decisionId,
              decisionIds: run.decisionScopes.map((scope) => scope.decisionId),
            }),
          };
        },
      ),
    );

    return this.unwrapOutcome(outcome, 'run');
  }

  /** 在同一权限事务中读取或修改 Thread，避免先鉴权后读取历史内容。 */
  async withAccessibleThread<T>(
    authorization: AuthorizationContext,
    threadId: string,
    candidateSourceIds: readonly string[],
    action: (
      tx: Prisma.TransactionClient,
      scope: AiAccessibleThreadScope,
    ) => Promise<T>,
  ): Promise<T> {
    this.assertPermissions(authorization);
    this.assertUuid(threadId, 'threadId');
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const outcome = await this.runSerializableTransaction<
      AiScopeTransactionOutcome<T>
    >(async (tx) => {
      const thread = await tx.aiThread.findFirst({
        where: { id: threadId, ownerUserId: authorization.userId },
        select: aiThreadScopeSelect,
      });
      if (!thread) {
        return { kind: 'not_found' };
      }

      const accessible = await this.isThreadScopeAccessible(
        tx,
        decisionWhere,
        thread,
        candidateSourceIds,
      );
      if (!accessible) {
        await this.lockThreadScope(tx, thread);
        return { kind: 'scope_changed' };
      }

      await this.unlockThreadScope(tx, thread);
      return {
        kind: 'success',
        value: await action(tx, {
          threadId: thread.id,
          decisionId: thread.decisionId,
        }),
      };
    });

    return this.unwrapOutcome(outcome, 'thread');
  }

  /** 在历史列表查询前重新扫描当前 owner 的 Thread，并隐藏本轮新锁定项。 */
  async revalidateOwnedThreads(
    authorization: AuthorizationContext,
    decisionId?: number,
  ): Promise<void> {
    await this.withRevalidatedOwnedThreads(authorization, decisionId, () =>
      Promise.resolve(),
    );
  }

  /** 在同一事务中扫描 owner 的全部 Thread 后执行历史列表安全查询。 */
  async withRevalidatedOwnedThreads<T>(
    authorization: AuthorizationContext,
    decisionId: number | undefined,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    this.assertPermissions(authorization);
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );

    return this.runSerializableTransaction(async (tx) => {
      const threads = await tx.aiThread.findMany({
        where: {
          ownerUserId: authorization.userId,
          ...(decisionId === undefined
            ? {}
            : {
                OR: [
                  { decisionId },
                  {
                    runs: {
                      some: {
                        decisionScopes: { some: { decisionId } },
                      },
                    },
                  },
                ],
              }),
        },
        select: aiThreadScopeSelect,
      });

      for (const thread of threads) {
        const accessible = await this.isThreadScopeAccessible(
          tx,
          decisionWhere,
          thread,
          [],
        );
        if (accessible) {
          await this.unlockThreadScope(tx, thread);
        } else {
          await this.lockThreadScope(tx, thread);
        }
      }

      return action(tx);
    });
  }

  /** 在调用方事务中幂等登记工具读取或回答引用来源。 */
  async registerSourceDependencies(
    tx: Prisma.TransactionClient,
    runId: string,
    usage: AiSourceDependencyUsage,
    sourceIds: readonly string[],
  ): Promise<void> {
    const normalized = [...new Set(sourceIds)];
    if (normalized.length === 0) {
      return;
    }

    await tx.aiSourceDependency.createMany({
      data: normalized.map((sourceId) => ({ runId, sourceId, usage })),
      skipDuplicates: true,
    });
  }

  /** 校验 Thread 绑定 Decision、历史工具来源、登记依赖和候选来源全部可见。 */
  private async isThreadScopeAccessible(
    tx: Prisma.TransactionClient,
    decisionWhere: Prisma.DecisionWhereInput,
    thread: AiThreadScopeRecord,
    candidateSourceIds: readonly string[],
  ): Promise<boolean> {
    const sourceIds = this.collectThreadSourceIds(thread, candidateSourceIds);
    const decisionIds: number[] = [];

    for (const sourceId of sourceIds) {
      const match = DECISION_SOURCE_PATTERN.exec(sourceId);
      const decisionId = match ? Number(match[1]) : Number.NaN;
      if (
        !match ||
        !Number.isSafeInteger(decisionId) ||
        decisionId <= 0 ||
        `decision:${decisionId}` !== sourceId
      ) {
        return false;
      }
      decisionIds.push(decisionId);
    }

    const uniqueDecisionIds = [...new Set(decisionIds)];
    const visible = await tx.decision.findMany({
      where: {
        AND: [{ id: { in: uniqueDecisionIds } }, decisionWhere],
      },
      select: { id: true },
    });

    return visible.length === uniqueDecisionIds.length;
  }

  /** 汇总 Thread 绑定范围、新表依赖与迁移前工具摘要中的全部来源 ID。 */
  private collectThreadSourceIds(
    thread: AiThreadScopeRecord,
    candidateSourceIds: readonly string[],
  ): string[] {
    const sourceIds = new Set<string>(candidateSourceIds);

    if (thread.decisionId !== null) {
      sourceIds.add(`decision:${thread.decisionId}`);
    }

    for (const run of thread.runs) {
      run.sourceDependencies.forEach((dependency) => {
        sourceIds.add(dependency.sourceId);
      });
      run.toolCalls.forEach((toolCall) => {
        this.extractLegacyToolSourceIds(toolCall.resultSummary).forEach(
          (sourceId) => sourceIds.add(sourceId),
        );
      });
    }

    return [...sourceIds];
  }

  /** 从 migration 前已有工具摘要读取来源；损坏结构返回未知标记并关闭权限。 */
  private extractLegacyToolSourceIds(resultSummary: unknown): string[] {
    if (
      !resultSummary ||
      typeof resultSummary !== 'object' ||
      Array.isArray(resultSummary)
    ) {
      return ['__invalid_tool_sources__'];
    }
    const sourceIds = (resultSummary as Record<string, unknown>).sourceIds;
    if (!Array.isArray(sourceIds)) {
      return ['__invalid_tool_sources__'];
    }
    const normalized: string[] = [];
    for (const sourceId of sourceIds) {
      if (typeof sourceId !== 'string' || sourceId.length === 0) {
        return ['__invalid_tool_sources__'];
      }
      normalized.push(sourceId);
    }
    return normalized;
  }

  /** 原子锁定 Thread、取消活跃 Run、清理门禁、废租约并追加状态事件。 */
  private async lockThreadScope(
    tx: Prisma.TransactionClient,
    thread: AiThreadScopeRecord,
  ): Promise<void> {
    const now = new Date();
    const activeRun = thread.activeRun;

    if (
      activeRun &&
      ACTIVE_RUN_STATUSES.some((status) => status === activeRun.status)
    ) {
      const cancelled = await tx.aiRun.updateMany({
        where: { id: activeRun.id, status: activeRun.status },
        data: {
          status: AiRunStatus.CANCELLED,
          cancellationReason: AiRunCancellationReason.SCOPE_CHANGED,
          failureReason: null,
          failureCode: null,
          executionLeaseId: null,
          executionLeaseExpiresAt: null,
          finishedAt: now,
          nextEventSequence: { increment: 1 },
        },
      });
      if (cancelled.count === 1) {
        const cancelledRun = await tx.aiRun.findUniqueOrThrow({
          where: { id: activeRun.id },
          select: { nextEventSequence: true },
        });
        await tx.aiEvent.create({
          data: {
            runId: activeRun.id,
            sequence: cancelledRun.nextEventSequence - 1,
            type: 'RUN_STATUS_CHANGED',
            payload: {
              fromStatus: activeRun.status,
              toStatus: AiRunStatus.CANCELLED,
              cancellationReason: AiRunCancellationReason.SCOPE_CHANGED,
              failureReason: null,
            },
          },
        });
      }
    }

    if (
      thread.scopeState !== AiThreadScopeState.LOCKED ||
      thread.lockReason !== AiThreadLockReason.SCOPE_CHANGED ||
      thread.activeRunId !== null
    ) {
      await tx.aiThread.update({
        where: { id: thread.id },
        data: {
          activeRunId: null,
          scopeState: AiThreadScopeState.LOCKED,
          lockReason: AiThreadLockReason.SCOPE_CHANGED,
          scopeChangedAt: thread.scopeChangedAt ?? now,
        },
      });
    }
  }

  /** 仅在 Decision 和全部依赖重新可见后清理 Thread 范围锁定。 */
  private async unlockThreadScope(
    tx: Prisma.TransactionClient,
    thread: AiThreadScopeRecord,
  ): Promise<void> {
    if (thread.scopeState !== AiThreadScopeState.LOCKED) {
      return;
    }

    await tx.aiThread.update({
      where: { id: thread.id },
      data: {
        scopeState: AiThreadScopeState.ACTIVE,
        lockReason: null,
        scopeChangedAt: null,
      },
    });
  }

  /** 把已经提交的权限事务结果转换为业务值或不泄漏正文的稳定错误。 */
  private unwrapOutcome<T>(
    outcome: AiScopeTransactionOutcome<T>,
    target: 'thread' | 'run',
  ): T {
    if (outcome.kind === 'success') {
      return outcome.value;
    }
    if (outcome.kind === 'scope_changed') {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
        message: 'AI 会话的业务权限范围已经变化',
        status: HttpStatus.CONFLICT,
      });
    }

    throw new BusinessException({
      code:
        target === 'run'
          ? API_ERROR_CODES.AI_RUN_NOT_FOUND
          : API_ERROR_CODES.AI_THREAD_NOT_FOUND,
      message:
        target === 'run'
          ? 'AI 运行不存在或当前账号无权访问'
          : 'AI 会话不存在或当前账号无权访问',
      status: HttpStatus.NOT_FOUND,
    });
  }

  /**
   * 仅在当前 Nest 进程内依次执行同一 Run 的权限事务，并在队尾完成时释放 Map。
   * 该队列只减少热点争用，不承担多实例互斥或权限一致性职责。
   */
  private async runTransactionByRun<T>(
    runId: string,
    action: () => Promise<T>,
  ): Promise<T> {
    const previousTail =
      this.runTransactionTails.get(runId) ?? Promise.resolve();
    let releaseCurrent: () => void = () => undefined;
    const currentGate = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const currentTail = previousTail
      .catch(() => undefined)
      .then(() => currentGate);
    this.runTransactionTails.set(runId, currentTail);

    await previousTail.catch(() => undefined);
    try {
      return await action();
    } finally {
      releaseCurrent();
      if (this.runTransactionTails.get(runId) === currentTail) {
        this.runTransactionTails.delete(runId);
      }
    }
  }

  /** 使用可串行化隔离运行权限事务，并对 PostgreSQL 写冲突执行有限重试。 */
  private async runSerializableTransaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= MAX_SCOPE_TRANSACTION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const canRetry =
          this.isRetryableTransactionError(error) &&
          attempt < MAX_SCOPE_TRANSACTION_ATTEMPTS;
        if (!canRetry) {
          throw error;
        }
        await this.waitForTransactionRetry(attempt);
      }
    }

    throw new Error('AI 权限事务重试次数异常耗尽');
  }

  /** 跨 Prisma 运行时包边界按稳定错误码识别可重试的事务写冲突。 */
  private isRetryableTransactionError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const record = error as {
      code?: unknown;
      name?: unknown;
      cause?: { kind?: unknown };
    };
    return (
      record.code === 'P2034' ||
      (record.name === 'DriverAdapterError' &&
        record.cause?.kind === 'TransactionWriteConflict')
    );
  }

  /** 以很短的退避错开并发事务，避免所有请求同步重试后再次冲突。 */
  private waitForTransactionRetry(attempt: number): Promise<void> {
    const delayMs = attempt * 2 + Math.floor(Math.random() * 5);
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  /** 校验所有来源权限入口共同要求的系统权限。 */
  private assertPermissions(authorization: AuthorizationContext): void {
    this.authorizationService.assertPermission(authorization, 'ai:chat:use');
    this.authorizationService.assertPermission(authorization, 'decision:read');
  }

  /** 防御性拒绝无效 UUID，避免文本进入 PostgreSQL UUID 比较。 */
  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
        message: `${field} 必须是有效 UUID`,
        status: HttpStatus.BAD_REQUEST,
        details: [
          {
            field,
            message: `${field} 必须是有效 UUID`,
            rule: 'AI_SCOPE_UUID_INVALID',
          },
        ],
      });
    }
  }
}
