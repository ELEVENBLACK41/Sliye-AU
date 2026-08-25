/**
 * 本文件负责只读工具调用的持久化摘要、来源登记与对应流事件。
 * 发起和结束都在同一事务内校验执行租约，保证失效执行器的迟到写入被拒绝；
 * 工具原始输入输出不进入消息正文，这里只保存受控快照与摘要。
 */

import { Injectable } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import { PrismaService } from '../../../database/prisma.service';
import { AiToolCallStatus } from '../../../generated/prisma';
import type {
  SettleAiToolCallInput,
  StartAiToolCallInput,
} from '../types/ai-persistence.types';
import { AiEventService } from './ai-event.service';
import { AiExecutionLeaseService } from './ai-execution-lease.service';
import { AiSourceDependencyService } from './ai-source-dependency.service';

/** 一次已持久化工具调用的稳定标识。 */
export type StartedAiToolCall = {
  /** 工具调用记录主键，结束调用和事件负载都使用该标识。 */
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

        return { toolCallId: toolCall.id };
      });
    } catch (error) {
      if (!this.isUniqueConstraintViolation(error)) {
        throw error;
      }

      return this.findExistingToolCall(
        input.runId,
        input.providerToolCallId,
      );
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

  /** 查询同一 Run 内已经登记的同一模型工具调用，用于并发或重放场景返回稳定结果。 */
  private async findExistingToolCall(
    runId: string,
    providerToolCallId: string,
  ): Promise<StartedAiToolCall> {
    const existing = await this.prisma.aiToolCall.findUnique({
      where: {
        runId_providerToolCallId: { runId, providerToolCallId },
      },
      select: { id: true },
    });
    if (!existing) {
      throw new Error('AI 工具调用写入冲突后仍找不到既有记录。');
    }

    return { toolCallId: existing.id };
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
