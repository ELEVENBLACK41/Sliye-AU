/**
 * 本文件负责只读工具调用的持久化摘要、来源登记与对应流事件。
 * 发起和结束都在同一事务内校验执行租约，保证失效执行器的迟到写入被拒绝；
 * 工具原始输入输出不进入消息正文，这里只保存受控快照与摘要。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import type { ApiErrorCode } from '@workspace/contracts/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { AiToolCallStatus, type Prisma } from '../../../generated/prisma';
import type {
  SettleAiToolCallInput,
  StartAiToolCallInput,
} from '../types/ai-persistence.types';
import { AiEventService } from './ai-event.service';
import { AiExecutionLeaseService } from './ai-execution-lease.service';
import { AiSourceDependencyService } from './ai-source-dependency.service';
import { createAiJsonFingerprint } from './ai-persistence.utils';
import { isTruncatedAiToolOutputSummary } from './ai-tool-output-summary';

/** 一次已持久化工具调用的稳定标识。 */
export type StartedAiToolCall =
  | {
      /** 本次请求新建了工具调用，调用方可以执行真实工具。 */
      state: 'CREATED';
      /** 工具调用记录主键。 */
      toolCallId: string;
    }
  | {
      /** 相同模型调用已经成功，直接重放持久化摘要。 */
      state: 'REPLAY_SUCCEEDED';
      /** 工具调用记录主键。 */
      toolCallId: string;
      /** 已持久化的窄输出摘要。 */
      output: unknown;
    }
  | {
      /** 相同模型调用已经失败，直接重放稳定失败。 */
      state: 'REPLAY_FAILED';
      /** 工具调用记录主键。 */
      toolCallId: string;
      /** 已持久化的稳定错误码。 */
      failureCode: ApiErrorCode;
      /** 已持久化的安全失败说明。 */
      failureReason: string;
    }
  | {
      /** 相同模型调用已成功，但落库摘要被截断，无法还原真实输出。 */
      state: 'REPLAY_UNAVAILABLE';
      /** 工具调用记录主键。 */
      toolCallId: string;
    }
  | {
      /** 相同模型调用仍在执行，不允许启动第二次业务查询。 */
      state: 'IN_PROGRESS';
      /** 工具调用记录主键。 */
      toolCallId: string;
    };

/** 一次已发现候选的历史工具调用摘要，用于强制 Agent 串联规则。 */
export type AiDiscoveryToolCallSummary = {
  /** 工具调用记录主键。 */
  toolCallId: string;
  /** 本次发现返回的候选目标标识集合，按工具描述声明的字段提取。 */
  candidateIdentifiers: Array<number | string>;
};

@Injectable()
export class AiToolCallService {
  /** 注入数据库、事件、租约与来源登记服务，保证工具审计与流事件同事务落库。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: AiEventService,
    private readonly executionLeaseService: AiExecutionLeaseService,
    private readonly sourceDependencyService: AiSourceDependencyService,
  ) {}

  /** 在校验执行租约后登记一次工具调用发起，并追加可补拉的开始事件。 */
  async startToolCall(input: StartAiToolCallInput): Promise<StartedAiToolCall> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await this.executionLeaseService.assertActiveExecutionLeaseInTransaction(
          transaction,
          { runId: input.runId, executionLeaseId: input.executionLeaseId },
        );
        const toolCall = await transaction.aiToolCall.create({
          data: {
            runId: input.runId,
            providerToolCallId: input.providerToolCallId,
            toolName: input.toolName,
            status: AiToolCallStatus.RUNNING,
            input: input.input,
          },
          select: { id: true },
        });
        await this.eventService.appendExecutionEventInTransaction(transaction, {
          runId: input.runId,
          executionLeaseId: input.executionLeaseId,
          type: 'TOOL_CALL_STARTED',
          data: {
            toolCallId: toolCall.id,
            toolName: input.toolName,
            input: input.input,
          },
        });

        return { state: 'CREATED', toolCallId: toolCall.id };
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      return this.findExistingToolCall(input);
    }
  }

  /** 在校验执行租约后结束一次工具调用：写入结果摘要、登记来源并追加结束事件。 */
  async settleToolCall(input: SettleAiToolCallInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await this.executionLeaseService.assertActiveExecutionLeaseInTransaction(
        transaction,
        { runId: input.runId, executionLeaseId: input.executionLeaseId },
      );
      const settled = await transaction.aiToolCall.updateMany({
        where: {
          id: input.toolCallId,
          runId: input.runId,
          status: AiToolCallStatus.RUNNING,
        },
        data: {
          status:
            input.status === 'SUCCEEDED'
              ? AiToolCallStatus.SUCCEEDED
              : AiToolCallStatus.FAILED,
          outputSummary: input.outputSummary ?? undefined,
          failureCode: input.failureCode,
          failureReason: input.failureReason,
          durationMs: input.durationMs,
          finishedAt: new Date(),
        },
      });
      if (settled.count !== 1) {
        return;
      }

      const toolCall = await transaction.aiToolCall.findUnique({
        where: { id: input.toolCallId },
        select: { toolName: true },
      });
      await this.sourceDependencyService.registerReadSourcesInTransaction(
        transaction,
        {
          runId: input.runId,
          toolCallId: input.toolCallId,
          sources: input.sources,
        },
      );
      await this.eventService.appendExecutionEventInTransaction(transaction, {
        runId: input.runId,
        executionLeaseId: input.executionLeaseId,
        type: 'TOOL_CALL_SETTLED',
        data: {
          toolCallId: input.toolCallId,
          toolName: toolCall?.toolName ?? '',
          status: input.status,
          outputSummary: input.outputSummary ?? null,
          failureCode: input.failureCode,
          failureReason: input.failureReason,
          durationMs: input.durationMs,
        },
      });
    });
  }

  /** 在 Run 终态事务内把遗留的运行中工具调用收敛为失败，避免审计状态永久悬挂。 */
  async failRunningToolCallsInTransaction(
    transaction: Prisma.TransactionClient,
    runId: string,
    finishedAt: Date,
  ): Promise<void> {
    const runningCalls = await transaction.aiToolCall.findMany({
      where: { runId, status: AiToolCallStatus.RUNNING },
      select: { id: true, toolName: true, startedAt: true },
    });

    for (const toolCall of runningCalls) {
      const durationMs = Math.max(
        0,
        finishedAt.getTime() - toolCall.startedAt.getTime(),
      );
      const failed = await transaction.aiToolCall.updateMany({
        where: { id: toolCall.id, status: AiToolCallStatus.RUNNING },
        data: {
          status: AiToolCallStatus.FAILED,
          failureCode: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
          failureReason: 'AI 运行已结束，工具调用未能完成',
          durationMs,
          finishedAt,
        },
      });
      if (failed.count === 1) {
        await this.eventService.appendToolCallSettledByControlInTransaction(
          transaction,
          {
            runId,
            toolCallId: toolCall.id,
            toolName: toolCall.toolName,
            failureCode: API_ERROR_CODES.AI_EXECUTION_LEASE_INVALID,
            failureReason: 'AI 运行已结束，工具调用未能完成',
            durationMs,
          },
        );
      }
    }
  }

  /**
   * 列出本 Run 内已成功执行的实体发现调用及其候选标识。
   * 这是 Agent 串联规则的唯一依据：只有某次发现调用返回了唯一候选，
   * 该候选标识才允许被后续上下文读取工具使用，模型不能凭空猜测标识。
   * 候选字段名来自工具描述的前置发现声明，因此新增同类工具不需要改动本方法。
   */
  async listSucceededDiscoveryCalls(
    runId: string,
    toolName: string,
    candidateListField: string,
    candidateIdentifierField: string,
  ): Promise<AiDiscoveryToolCallSummary[]> {
    const toolCalls = await this.prisma.aiToolCall.findMany({
      where: {
        runId,
        toolName,
        status: AiToolCallStatus.SUCCEEDED,
      },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, outputSummary: true },
    });

    return toolCalls.map((toolCall) => ({
      toolCallId: toolCall.id,
      candidateIdentifiers: this.extractCandidateIdentifiers(
        toolCall.outputSummary,
        candidateListField,
        candidateIdentifierField,
      ),
    }));
  }

  /** 从已持久化的候选摘要中按声明字段提取目标标识，忽略结构不符合预期的历史记录。 */
  private extractCandidateIdentifiers(
    outputSummary: unknown,
    candidateListField: string,
    candidateIdentifierField: string,
  ): Array<number | string> {
    if (typeof outputSummary !== 'object' || outputSummary === null) {
      return [];
    }

    const candidates = (outputSummary as Record<string, unknown>)[
      candidateListField
    ];
    if (!Array.isArray(candidates)) {
      return [];
    }

    return candidates
      .map((candidate) =>
        typeof candidate === 'object' && candidate !== null
          ? (candidate as Record<string, unknown>)[candidateIdentifierField]
          : null,
      )
      .filter(
        (identifier): identifier is number | string =>
          typeof identifier === 'number' || typeof identifier === 'string',
      );
  }

  /**
   * 查询同一 Run 内已经登记的同一模型工具调用，用于并发或重放场景返回稳定结果。
   * 读取前重新校验执行租约：租约失效说明用户已停止或该 Run 已被对账收敛，
   * 此时不允许旧执行器把已登记的工具结果再读回模型，与步骤重放路径保持一致。
   */
  private async findExistingToolCall(
    input: StartAiToolCallInput,
  ): Promise<StartedAiToolCall> {
    const existing = await this.prisma.$transaction(async (transaction) => {
      await this.executionLeaseService.assertActiveExecutionLeaseInTransaction(
        transaction,
        { runId: input.runId, executionLeaseId: input.executionLeaseId },
      );

      return transaction.aiToolCall.findUnique({
        where: {
          runId_providerToolCallId: {
            runId: input.runId,
            providerToolCallId: input.providerToolCallId,
          },
        },
        select: {
          id: true,
          toolName: true,
          input: true,
          status: true,
          outputSummary: true,
          failureCode: true,
          failureReason: true,
        },
      });
    });
    if (!existing) {
      throw new Error('AI 工具调用写入冲突后仍找不到既有记录。');
    }

    if (
      existing.toolName !== input.toolName ||
      createAiJsonFingerprint(existing.input) !==
        createAiJsonFingerprint(input.input)
    ) {
      throw new BusinessException({
        code: API_ERROR_CODES.AI_IDEMPOTENCY_CONFLICT,
        message: '相同工具调用标识对应了不同的工具或输入',
        status: HttpStatus.CONFLICT,
      });
    }
    if (existing.status === AiToolCallStatus.SUCCEEDED) {
      // 摘要被截断时数据库里只有一个截断标记，把它当成成功输出会误导模型。
      return isTruncatedAiToolOutputSummary(existing.outputSummary)
        ? { state: 'REPLAY_UNAVAILABLE', toolCallId: existing.id }
        : {
            state: 'REPLAY_SUCCEEDED',
            toolCallId: existing.id,
            output: existing.outputSummary,
          };
    }
    if (existing.status === AiToolCallStatus.FAILED) {
      return {
        state: 'REPLAY_FAILED',
        toolCallId: existing.id,
        failureCode:
          (existing.failureCode as ApiErrorCode | null) ??
          API_ERROR_CODES.AI_TOOL_EXECUTION_FAILED,
        failureReason: existing.failureReason ?? '工具调用执行失败',
      };
    }

    return { state: 'IN_PROGRESS', toolCallId: existing.id };
  }

  /** 判断异常是否由数据库唯一约束触发。 */
  private isUniqueConstraintViolation(
    error: unknown,
  ): error is PrismaClientKnownRequestError {
    return (
      error instanceof PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }
}
