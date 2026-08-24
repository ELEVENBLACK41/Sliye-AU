/**
 * 本文件负责 AI Thread、用户消息和 Run 的原子创建、幂等重放与单 Run 门禁。
 */

import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import type { AiLanguageModelRole } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiMessageRole,
  AiRequestOperation,
  AiRunScopeResolutionMethod,
  AiRunScopeResolutionStatus,
  AiRunStatus,
  AiThreadScopeState,
  Prisma,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { AuthorizationService } from '../../auth/services/authorization.service';
import {
  toAiMessage,
  toAiRunPublicSummary,
  toAiThread,
  toAiLanguageModelRole,
  toPrismaAiLanguageModelRole,
} from '../ai-state.mapper';
import type {
  AiRunCreationResult,
  CreateInitialAiRunCommand,
  CreateThreadMessageRunCommand,
  RetryAiRunCommand,
} from '../types/ai-state-persistence.types';
import { AiThreadScopeService } from './ai-thread-scope.service';

/** 第一版用户消息允许持久化的最大 Unicode 字符数。 */
const MAX_AI_MESSAGE_CHARACTERS = 20_000;
/** 默认会话标题保留的最大 Unicode 字符数。 */
const MAX_AI_THREAD_TITLE_CHARACTERS = 60;
/** 浏览器请求幂等记录的第一版有效时长。 */
const AI_IDEMPOTENCY_TTL_MILLISECONDS = 24 * 60 * 60 * 1000;
/** 接受标准 UUID 文本，数据库仍通过 UUID 原生类型执行最终约束。 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 幂等结果需要加载的 Thread、Message 和 Run。 */
const aiRequestDeduplicationInclude = {
  thread: true,
  message: true,
  run: true,
} as const satisfies Prisma.AiRequestDeduplicationInclude;

/** 带完整原子创建结果的幂等记录。 */
type AiRequestDeduplicationRecord = Prisma.AiRequestDeduplicationGetPayload<{
  include: typeof aiRequestDeduplicationInclude;
}>;

/** 浏览器幂等请求在数据库中的稳定查找键。 */
type AiIdempotencyLookup = {
  /** 请求所属用户主键。 */
  userId: number;
  /** 创建 Thread、追加消息或重试 Run 的操作类型。 */
  operation: AiRequestOperation;
  /** 由服务端生成的 Decision、Thread 或 Run 范围键。 */
  scopeKey: string;
  /** 浏览器生成的 UUID 幂等键。 */
  clientRequestId: string;
};

/** 初始创建事务只返回新结果，或把旧幂等记录交给 Thread 全范围事务读取。 */
type AiInitialRunTransactionOutcome =
  | { kind: 'created'; value: AiRunCreationResult }
  | { kind: 'replay'; threadId: string };

@Injectable()
export class AiThreadService {
  /** 注入数据库和统一授权查询能力。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly threadScopeService: AiThreadScopeService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 原子创建绑定 Decision 的 Thread、首条用户消息、首个 Run 和幂等记录。 */
  async createInitialRun(
    command: CreateInitialAiRunCommand,
  ): Promise<AiRunCreationResult> {
    const content = this.normalizeMessageContent(command.content);
    this.assertUuid(command.clientRequestId, 'clientRequestId');
    if (command.decisionId === undefined) {
      return this.createUnboundInitialRun(command, content);
    }
    const scopeKey = this.createDecisionScopeKey(command.decisionId);
    const fingerprint = this.createRequestFingerprint({
      operation: AiRequestOperation.CREATE_THREAD,
      scopeKey,
      content,
      modelRole: command.modelRole,
    });
    const idempotency = {
      userId: command.authorization.userId,
      operation: AiRequestOperation.CREATE_THREAD,
      scopeKey,
      clientRequestId: command.clientRequestId,
    } as const;

    const threadId = randomUUID();
    const messageId = randomUUID();
    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + AI_IDEMPOTENCY_TTL_MILLISECONDS);

    try {
      const outcome =
        await this.threadScopeService.withAccessibleDecision<AiInitialRunTransactionOutcome>(
          command.authorization,
          command.decisionId,
          async (tx, decision) => {
            const existing = await this.prepareIdempotentReference(
              tx,
              idempotency,
            );
            if (existing) {
              return { kind: 'replay', threadId: existing.threadId };
            }

            await tx.aiThread.create({
              data: {
                id: threadId,
                ownerUserId: command.authorization.userId,
                projectId: decision.projectId,
                decisionId: decision.decisionId,
                title: this.createThreadTitle(content),
              },
            });
            const message = await tx.aiMessage.create({
              data: {
                id: messageId,
                threadId,
                authorUserId: command.authorization.userId,
                role: AiMessageRole.USER,
                content,
              },
            });
            const run = await tx.aiRun.create({
              data: {
                id: runId,
                threadId,
                userMessageId: messageId,
                modelRole: toPrismaAiLanguageModelRole(command.modelRole),
                scopeStatus: AiRunScopeResolutionStatus.RESOLVED,
                scopeResolutionMethod:
                  AiRunScopeResolutionMethod.EXACT_REFERENCE,
                scopeResolvedAt: new Date(),
                decisionScopes: {
                  create: {
                    decisionId: decision.decisionId,
                    projectId: decision.projectId,
                    areaId: decision.areaId,
                  },
                },
              },
            });
            const thread = await tx.aiThread.update({
              where: { id: threadId },
              data: { activeRunId: runId },
            });
            await tx.aiRequestDeduplication.create({
              data: {
                ...idempotency,
                requestFingerprint: fingerprint,
                threadId,
                messageId,
                runId,
                expiresAt,
              },
            });

            return {
              kind: 'created',
              value: {
                thread: toAiThread(thread),
                message: toAiMessage(message),
                run: toAiRunPublicSummary(run),
                replayed: false,
              },
            };
          },
        );

      return outcome.kind === 'created'
        ? outcome.value
        : this.readAccessibleIdempotentResult(
            command.authorization,
            outcome.threadId,
            idempotency,
            fingerprint,
          );
    } catch (error) {
      return this.resolveConcurrentIdempotentRequest(
        error,
        command.authorization,
        idempotency,
        fingerprint,
      );
    }
  }

  /** 在已有 Thread 中原子创建用户消息和 Run，并以比较更新占用单 Run 门禁。 */
  async createMessageRun(
    command: CreateThreadMessageRunCommand,
  ): Promise<AiRunCreationResult> {
    const content = this.normalizeMessageContent(command.content);
    this.assertUuid(command.threadId, 'threadId');
    this.assertUuid(command.clientRequestId, 'clientRequestId');
    const scopeKey = this.createThreadScopeKey(command.threadId);
    const fingerprint = this.createRequestFingerprint({
      operation: AiRequestOperation.SEND_MESSAGE,
      scopeKey,
      content,
      modelRole: command.modelRole,
    });
    const idempotency = {
      userId: command.authorization.userId,
      operation: AiRequestOperation.SEND_MESSAGE,
      scopeKey,
      clientRequestId: command.clientRequestId,
    } as const;

    const messageId = randomUUID();
    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + AI_IDEMPOTENCY_TTL_MILLISECONDS);

    try {
      return await this.threadScopeService.withAccessibleThread(
        command.authorization,
        command.threadId,
        [],
        async (tx, currentThread) => {
          const existing = await this.prepareIdempotentRequest(tx, idempotency);
          if (existing) {
            return this.resolveIdempotentResult(existing, fingerprint);
          }

          // 先锁定 Thread 行再插入带外键的 Message/Run，避免并发事务在外键锁升级时形成死锁。
          const gate = await tx.aiThread.updateMany({
            where: {
              id: currentThread.threadId,
              ownerUserId: command.authorization.userId,
              scopeState: AiThreadScopeState.ACTIVE,
              activeRunId: null,
            },
            data: { updatedAt: new Date() },
          });

          if (gate.count !== 1) {
            this.throwThreadRunActive();
          }

          const message = await tx.aiMessage.create({
            data: {
              id: messageId,
              threadId: currentThread.threadId,
              authorUserId: command.authorization.userId,
              role: AiMessageRole.USER,
              content,
            },
          });
          const legacyDecision = currentThread.decisionId
            ? await tx.decision.findUniqueOrThrow({
                where: { id: currentThread.decisionId },
                select: { id: true, projectId: true, areaId: true },
              })
            : null;
          const run = await tx.aiRun.create({
            data: {
              id: runId,
              threadId: currentThread.threadId,
              userMessageId: messageId,
              modelRole: toPrismaAiLanguageModelRole(command.modelRole),
              ...(legacyDecision
                ? {
                    scopeStatus: AiRunScopeResolutionStatus.RESOLVED,
                    scopeResolutionMethod:
                      AiRunScopeResolutionMethod.EXACT_REFERENCE,
                    scopeResolvedAt: new Date(),
                    decisionScopes: {
                      create: {
                        decisionId: legacyDecision.id,
                        projectId: legacyDecision.projectId,
                        areaId: legacyDecision.areaId,
                      },
                    },
                  }
                : {}),
            },
          });
          const thread = await tx.aiThread.update({
            where: { id: currentThread.threadId },
            data: { activeRunId: runId },
          });
          await tx.aiRequestDeduplication.create({
            data: {
              ...idempotency,
              requestFingerprint: fingerprint,
              threadId: currentThread.threadId,
              messageId,
              runId,
              expiresAt,
            },
          });

          return {
            thread: toAiThread(thread),
            message: toAiMessage(message),
            run: toAiRunPublicSummary(run),
            replayed: false,
          };
        },
      );
    } catch (error) {
      return this.resolveConcurrentIdempotentRequest(
        error,
        command.authorization,
        idempotency,
        fingerprint,
      );
    }
  }

  /** 对失败或取消 Run 原子创建关联新 Run，并保证网络重放只返回同一个重试。 */
  async retryRun(command: RetryAiRunCommand): Promise<AiRunCreationResult> {
    this.assertUuid(command.runId, 'runId');
    this.assertUuid(command.clientRequestId, 'clientRequestId');
    const scopeKey = this.createRunScopeKey(command.runId);
    const idempotency = {
      userId: command.authorization.userId,
      operation: AiRequestOperation.RETRY_RUN,
      scopeKey,
      clientRequestId: command.clientRequestId,
    } as const;

    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + AI_IDEMPOTENCY_TTL_MILLISECONDS);
    let fingerprint: string | null = null;

    try {
      return await this.threadScopeService.withAccessibleRun(
        command.authorization,
        command.runId,
        [],
        async (tx, accessible) => {
          const source = await tx.aiRun.findUniqueOrThrow({
            where: { id: command.runId },
            include: {
              userMessage: true,
              decisionScopes: true,
              scopeCandidates: true,
            },
          });
          if (
            source.status !== AiRunStatus.FAILED &&
            source.status !== AiRunStatus.CANCELLED
          ) {
            this.throwRunNotRetryable();
          }

          fingerprint = this.createRequestFingerprint({
            operation: AiRequestOperation.RETRY_RUN,
            scopeKey,
            content: source.userMessage.content,
            modelRole: toAiLanguageModelRole(source.modelRole),
          });
          const existing = await this.prepareIdempotentRequest(tx, idempotency);
          if (existing) {
            return this.resolveIdempotentResult(existing, fingerprint);
          }

          const gate = await tx.aiThread.updateMany({
            where: {
              id: accessible.threadId,
              ownerUserId: command.authorization.userId,
              scopeState: AiThreadScopeState.ACTIVE,
              activeRunId: null,
            },
            data: { updatedAt: new Date() },
          });
          if (gate.count !== 1) {
            this.throwThreadRunActive();
          }

          const run = await tx.aiRun.create({
            data: {
              id: runId,
              threadId: accessible.threadId,
              userMessageId: source.userMessageId,
              retryOfRunId: source.id,
              modelRole: source.modelRole,
              scopeStatus: source.scopeStatus,
              scopeResolutionMethod: source.scopeResolutionMethod,
              scopeResolvedAt: source.scopeResolvedAt,
              decisionScopes: {
                create: source.decisionScopes.map((scope) => ({
                  decisionId: scope.decisionId,
                  projectId: scope.projectId,
                  areaId: scope.areaId,
                })),
              },
              scopeCandidates: {
                create: source.scopeCandidates.map((candidate) => ({
                  decisionId: candidate.decisionId,
                })),
              },
            },
          });
          const thread = await tx.aiThread.update({
            where: { id: accessible.threadId },
            data: { activeRunId: run.id },
          });
          await tx.aiRequestDeduplication.create({
            data: {
              ...idempotency,
              requestFingerprint: fingerprint,
              threadId: accessible.threadId,
              messageId: source.userMessageId,
              runId: run.id,
              expiresAt,
            },
          });

          return {
            thread: toAiThread(thread),
            message: toAiMessage(source.userMessage),
            run: toAiRunPublicSummary(run),
            replayed: false,
          };
        },
      );
    } catch (error) {
      if (!fingerprint) {
        throw error;
      }
      return this.resolveConcurrentIdempotentRequest(
        error,
        command.authorization,
        idempotency,
        fingerprint,
      );
    }
  }

  /** 创建不绑定项目或决策的 Thread，并让首个 Run 等待后续范围发现。 */
  private async createUnboundInitialRun(
    command: CreateInitialAiRunCommand,
    content: string,
  ): Promise<AiRunCreationResult> {
    this.authorizationService.assertPermission(
      command.authorization,
      'ai:chat:use',
    );
    this.authorizationService.assertPermission(
      command.authorization,
      'decision:read',
    );
    const scopeKey = `user:${command.authorization.userId}`;
    const fingerprint = this.createRequestFingerprint({
      operation: AiRequestOperation.CREATE_THREAD,
      scopeKey,
      content,
      modelRole: command.modelRole,
    });
    const idempotency = {
      userId: command.authorization.userId,
      operation: AiRequestOperation.CREATE_THREAD,
      scopeKey,
      clientRequestId: command.clientRequestId,
    } as const;
    const threadId = randomUUID();
    const messageId = randomUUID();
    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + AI_IDEMPOTENCY_TTL_MILLISECONDS);

    try {
      const outcome =
        await this.prisma.$transaction<AiInitialRunTransactionOutcome>(
          async (tx) => {
            const existing = await this.prepareIdempotentReference(
              tx,
              idempotency,
            );
            if (existing) {
              return { kind: 'replay', threadId: existing.threadId };
            }

            await tx.aiThread.create({
              data: {
                id: threadId,
                ownerUserId: command.authorization.userId,
                title: this.createThreadTitle(content),
              },
            });
            const message = await tx.aiMessage.create({
              data: {
                id: messageId,
                threadId,
                authorUserId: command.authorization.userId,
                role: AiMessageRole.USER,
                content,
              },
            });
            const run = await tx.aiRun.create({
              data: {
                id: runId,
                threadId,
                userMessageId: messageId,
                modelRole: toPrismaAiLanguageModelRole(command.modelRole),
              },
            });
            const thread = await tx.aiThread.update({
              where: { id: threadId },
              data: { activeRunId: runId },
            });
            await tx.aiRequestDeduplication.create({
              data: {
                ...idempotency,
                requestFingerprint: fingerprint,
                threadId,
                messageId,
                runId,
                expiresAt,
              },
            });

            return {
              kind: 'created',
              value: {
                thread: toAiThread(thread),
                message: toAiMessage(message),
                run: toAiRunPublicSummary(run),
                replayed: false,
              },
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

      return outcome.kind === 'created'
        ? outcome.value
        : this.readAccessibleIdempotentResult(
            command.authorization,
            outcome.threadId,
            idempotency,
            fingerprint,
          );
    } catch (error) {
      return this.resolveConcurrentIdempotentRequest(
        error,
        command.authorization,
        idempotency,
        fingerprint,
      );
    }
  }

  /** 在调用方权限事务中删除过期记录，并读取完整幂等结果。 */
  private async prepareIdempotentRequest(
    tx: Prisma.TransactionClient,
    options: AiIdempotencyLookup,
  ): Promise<AiRequestDeduplicationRecord | null> {
    const now = new Date();
    await tx.aiRequestDeduplication.deleteMany({
      where: { ...options, expiresAt: { lte: now } },
    });

    return tx.aiRequestDeduplication.findFirst({
      where: { ...options, expiresAt: { gt: now } },
      include: aiRequestDeduplicationInclude,
    });
  }

  /** 初始创建仅读取旧记录的 Thread 引用，正文稍后由完整范围事务恢复。 */
  private async prepareIdempotentReference(
    tx: Prisma.TransactionClient,
    options: AiIdempotencyLookup,
  ): Promise<{ threadId: string } | null> {
    const now = new Date();
    await tx.aiRequestDeduplication.deleteMany({
      where: { ...options, expiresAt: { lte: now } },
    });

    return tx.aiRequestDeduplication.findFirst({
      where: { ...options, expiresAt: { gt: now } },
      select: { threadId: true },
    });
  }

  /** 在 Thread 全依赖复核事务中重新读取旧幂等结果，避免正文恢复越权。 */
  private async readAccessibleIdempotentResult(
    authorization: AuthorizationContext,
    threadId: string,
    options: AiIdempotencyLookup,
    fingerprint: string,
  ): Promise<AiRunCreationResult> {
    return this.threadScopeService.withAccessibleThread(
      authorization,
      threadId,
      [],
      async (tx) => {
        const record = await tx.aiRequestDeduplication.findFirst({
          where: { ...options, expiresAt: { gt: new Date() } },
          include: aiRequestDeduplicationInclude,
        });
        if (!record) {
          this.throwIdempotencyConflict();
        }
        return this.resolveIdempotentResult(record, fingerprint);
      },
    );
  }

  /** 唯一键竞争后只读取引用，再通过 Thread 权限事务恢复胜出请求。 */
  private async resolveConcurrentIdempotentRequest(
    error: unknown,
    authorization: AuthorizationContext,
    options: AiIdempotencyLookup,
    fingerprint: string,
  ): Promise<AiRunCreationResult> {
    if (!this.isUniqueConstraintError(error)) {
      throw error;
    }

    const concurrent = await this.prisma.aiRequestDeduplication.findFirst({
      where: { ...options, expiresAt: { gt: new Date() } },
      select: { threadId: true },
    });
    if (!concurrent) {
      this.throwIdempotencyConflict();
    }

    return this.readAccessibleIdempotentResult(
      authorization,
      concurrent.threadId,
      options,
      fingerprint,
    );
  }

  /** 跨 Prisma 运行时包边界按稳定错误码识别唯一键冲突。 */
  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  /** 返回不泄漏胜出记录内容的稳定幂等竞争错误。 */
  private throwIdempotencyConflict(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
      message: 'AI 请求幂等记录发生冲突，请刷新后重试',
      status: HttpStatus.CONFLICT,
    });
  }

  /** 校验幂等重放载荷一致，并返回原始 Thread、Message 和 Run。 */
  private resolveIdempotentResult(
    record: AiRequestDeduplicationRecord,
    fingerprint: string,
  ): AiRunCreationResult {
    if (record.requestFingerprint !== fingerprint) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
        message: '同一 AI 请求幂等键不能用于不同的消息或模型角色',
        status: HttpStatus.CONFLICT,
      });
    }

    return {
      thread: toAiThread(record.thread),
      message: toAiMessage(record.message),
      run: toAiRunPublicSummary(record.run),
      replayed: true,
    };
  }

  /** 规范化用户消息并拒绝空白或超出第一版安全上限的正文。 */
  private normalizeMessageContent(content: string): string {
    const normalized = content.trim();
    const characterCount = Array.from(normalized).length;

    if (characterCount === 0) {
      this.throwValidationError('content', 'AI 消息不能为空');
    }
    if (characterCount > MAX_AI_MESSAGE_CHARACTERS) {
      this.throwValidationError(
        'content',
        `AI 消息不能超过 ${MAX_AI_MESSAGE_CHARACTERS} 个字符`,
      );
    }

    return normalized;
  }

  /** 从首条问题生成不额外调用模型的受控长度默认标题。 */
  private createThreadTitle(content: string): string {
    const characters = Array.from(content);
    const title = characters.slice(0, MAX_AI_THREAD_TITLE_CHARACTERS).join('');

    return characters.length > MAX_AI_THREAD_TITLE_CHARACTERS
      ? `${title}…`
      : title;
  }

  /** 对规范化请求关键字段生成不包含正文的 SHA-256 指纹。 */
  private createRequestFingerprint(value: {
    operation: AiRequestOperation;
    scopeKey: string;
    content: string;
    modelRole: AiLanguageModelRole;
  }): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  /** 生成 Thread 创建请求的服务端 Decision 范围键。 */
  private createDecisionScopeKey(decisionId: number): string {
    return `decision:${decisionId}`;
  }

  /** 生成后续消息请求的服务端 Thread 范围键。 */
  private createThreadScopeKey(threadId: string): string {
    return `thread:${threadId}`;
  }

  /** 生成重试请求的服务端旧 Run 范围键。 */
  private createRunScopeKey(runId: string): string {
    return `run:${runId}`;
  }

  /** 防御性校验内部命令中的 UUID 字段。 */
  private assertUuid(value: string, field: string): void {
    if (!UUID_PATTERN.test(value)) {
      this.throwValidationError(field, `${field} 必须是有效 UUID`);
    }
  }

  /** 抛出稳定的字段级 AI 命令校验错误。 */
  private throwValidationError(field: string, message: string): never {
    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message,
      status: HttpStatus.BAD_REQUEST,
      details: [{ field, message, rule: 'AI_STATE_COMMAND_VALIDATION' }],
    });
  }

  /** 抛出同一 Thread 已存在非终态 Run 的稳定并发冲突。 */
  private throwThreadRunActive(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_THREAD_RUN_ACTIVE,
      message: '当前 AI 会话已有正在处理的请求',
      status: HttpStatus.CONFLICT,
    });
  }

  /** 拒绝对排队、运行中或已完成 Run 创建普通重试。 */
  private throwRunNotRetryable(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.AI_RUN_NOT_RETRYABLE,
      message: '只有失败或取消的 AI 运行可以重试',
      status: HttpStatus.CONFLICT,
    });
  }
}
