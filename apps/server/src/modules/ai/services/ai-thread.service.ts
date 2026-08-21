/**
 * 本文件负责 AI Thread、用户消息和 Run 的原子创建、幂等重放与单 Run 门禁。
 */

import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import type { AiLanguageModelRole } from '@workspace/contracts/ai';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  AiMessageRole,
  AiRequestOperation,
  AiThreadScopeState,
  type Prisma,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import {
  toAiMessage,
  toAiRun,
  toAiThread,
  toPrismaAiLanguageModelRole,
} from '../ai-state.mapper';
import type {
  AiRunCreationResult,
  CreateInitialAiRunCommand,
  CreateThreadMessageRunCommand,
} from '../types/ai-state-persistence.types';

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

/** 已通过当前权限校验的 Decision 绑定信息。 */
type AccessibleAiDecision = {
  /** 决策主键。 */
  id: number;
  /** 决策所属项目主键。 */
  projectId: number;
};

@Injectable()
export class AiThreadService {
  /** 注入数据库和统一授权查询能力。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 原子创建绑定 Decision 的 Thread、首条用户消息、首个 Run 和幂等记录。 */
  async createInitialRun(
    command: CreateInitialAiRunCommand,
  ): Promise<AiRunCreationResult> {
    const content = this.normalizeMessageContent(command.content);
    this.assertUuid(command.clientRequestId, 'clientRequestId');
    const decision = await this.findAccessibleDecision(
      command.authorization,
      command.decisionId,
    );
    const scopeKey = this.createDecisionScopeKey(decision.id);
    const fingerprint = this.createRequestFingerprint({
      operation: AiRequestOperation.CREATE_THREAD,
      scopeKey,
      content,
      modelRole: command.modelRole,
    });
    const existing = await this.prepareIdempotentRequest({
      userId: command.authorization.userId,
      operation: AiRequestOperation.CREATE_THREAD,
      scopeKey,
      clientRequestId: command.clientRequestId,
    });

    if (existing) {
      return this.resolveIdempotentResult(existing, fingerprint);
    }

    const threadId = randomUUID();
    const messageId = randomUUID();
    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + AI_IDEMPOTENCY_TTL_MILLISECONDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.aiThread.create({
          data: {
            id: threadId,
            ownerUserId: command.authorization.userId,
            projectId: decision.projectId,
            decisionId: decision.id,
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
            userId: command.authorization.userId,
            operation: AiRequestOperation.CREATE_THREAD,
            scopeKey,
            clientRequestId: command.clientRequestId,
            requestFingerprint: fingerprint,
            threadId,
            messageId,
            runId,
            expiresAt,
          },
        });

        return {
          thread: toAiThread(thread),
          message: toAiMessage(message),
          run: toAiRun(run),
          replayed: false,
        };
      });
    } catch (error) {
      return this.resolveConcurrentIdempotentRequest(
        error,
        command.authorization.userId,
        AiRequestOperation.CREATE_THREAD,
        scopeKey,
        command.clientRequestId,
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
    const currentThread = await this.findAccessibleThread(
      command.authorization,
      command.threadId,
    );
    const scopeKey = this.createThreadScopeKey(currentThread.id);
    const fingerprint = this.createRequestFingerprint({
      operation: AiRequestOperation.SEND_MESSAGE,
      scopeKey,
      content,
      modelRole: command.modelRole,
    });
    const existing = await this.prepareIdempotentRequest({
      userId: command.authorization.userId,
      operation: AiRequestOperation.SEND_MESSAGE,
      scopeKey,
      clientRequestId: command.clientRequestId,
    });

    if (existing) {
      return this.resolveIdempotentResult(existing, fingerprint);
    }

    const messageId = randomUUID();
    const runId = randomUUID();
    const expiresAt = new Date(Date.now() + AI_IDEMPOTENCY_TTL_MILLISECONDS);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 先锁定 Thread 行再插入带外键的 Message/Run，避免并发事务在外键锁升级时形成死锁。
        const gate = await tx.aiThread.updateMany({
          where: {
            id: currentThread.id,
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
            threadId: currentThread.id,
            authorUserId: command.authorization.userId,
            role: AiMessageRole.USER,
            content,
          },
        });
        const run = await tx.aiRun.create({
          data: {
            id: runId,
            threadId: currentThread.id,
            userMessageId: messageId,
            modelRole: toPrismaAiLanguageModelRole(command.modelRole),
          },
        });
        const thread = await tx.aiThread.update({
          where: { id: currentThread.id },
          data: { activeRunId: runId },
        });
        await tx.aiRequestDeduplication.create({
          data: {
            userId: command.authorization.userId,
            operation: AiRequestOperation.SEND_MESSAGE,
            scopeKey,
            clientRequestId: command.clientRequestId,
            requestFingerprint: fingerprint,
            threadId: currentThread.id,
            messageId,
            runId,
            expiresAt,
          },
        });

        return {
          thread: toAiThread(thread),
          message: toAiMessage(message),
          run: toAiRun(run),
          replayed: false,
        };
      });
    } catch (error) {
      return this.resolveConcurrentIdempotentRequest(
        error,
        command.authorization.userId,
        AiRequestOperation.SEND_MESSAGE,
        scopeKey,
        command.clientRequestId,
        fingerprint,
      );
    }
  }

  /** 查询当前用户仍可访问的 Decision，并由服务端解析真实 projectId。 */
  private async findAccessibleDecision(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<AccessibleAiDecision> {
    this.authorizationService.assertPermission(authorization, 'ai:chat:use');
    this.authorizationService.assertPermission(authorization, 'decision:read');

    if (!Number.isInteger(decisionId) || decisionId <= 0) {
      this.throwValidationError('decisionId', '决策主键必须是正整数');
    }

    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const decision = await this.prisma.decision.findFirst({
      where: { AND: [{ id: decisionId }, scopeWhere] },
      select: { id: true, projectId: true },
    });

    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '决策不存在或当前账号无权访问',
        status: HttpStatus.NOT_FOUND,
      });
    }

    return decision;
  }

  /** 查询当前用户拥有且仍处于可访问范围内的 Thread。 */
  private async findAccessibleThread(
    authorization: AuthorizationContext,
    threadId: string,
  ): Promise<{ id: string }> {
    const thread = await this.prisma.aiThread.findFirst({
      where: { id: threadId, ownerUserId: authorization.userId },
      select: { id: true, decisionId: true, scopeState: true },
    });

    if (!thread) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_NOT_FOUND,
        message: 'AI 会话不存在或当前账号无权访问',
        status: HttpStatus.NOT_FOUND,
      });
    }

    if (thread.scopeState === AiThreadScopeState.LOCKED) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_THREAD_SCOPE_CHANGED,
        message: 'AI 会话的业务权限范围已经变化',
        status: HttpStatus.CONFLICT,
      });
    }

    await this.findAccessibleDecision(authorization, thread.decisionId);
    return { id: thread.id };
  }

  /** 删除已经过期的同键记录，并返回仍在有效期内的幂等结果。 */
  private async prepareIdempotentRequest(options: {
    userId: number;
    operation: AiRequestOperation;
    scopeKey: string;
    clientRequestId: string;
  }): Promise<AiRequestDeduplicationRecord | null> {
    const now = new Date();
    await this.prisma.aiRequestDeduplication.deleteMany({
      where: { ...options, expiresAt: { lte: now } },
    });

    return this.prisma.aiRequestDeduplication.findFirst({
      where: { ...options, expiresAt: { gt: now } },
      include: aiRequestDeduplicationInclude,
    });
  }

  /** 并发失败后重新读取胜出请求；没有胜出记录时保留原始异常。 */
  private async resolveConcurrentIdempotentRequest(
    error: unknown,
    userId: number,
    operation: AiRequestOperation,
    scopeKey: string,
    clientRequestId: string,
    fingerprint: string,
  ): Promise<AiRunCreationResult> {
    const concurrent = await this.prisma.aiRequestDeduplication.findFirst({
      where: {
        userId,
        operation,
        scopeKey,
        clientRequestId,
        expiresAt: { gt: new Date() },
      },
      include: aiRequestDeduplicationInclude,
    });

    if (concurrent) {
      return this.resolveIdempotentResult(concurrent, fingerprint);
    }

    if (
      error instanceof PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
        message: 'AI 请求幂等记录发生冲突，请刷新后重试',
        status: HttpStatus.CONFLICT,
      });
    }

    throw error;
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
      run: toAiRun(record.run),
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
}
