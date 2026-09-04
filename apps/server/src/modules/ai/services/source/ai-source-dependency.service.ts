/**
 * 本文件负责登记一次 Run 实际读取或引用的业务来源。
 * 来源依赖是后续“单个来源失权只锁定受影响历史内容”和引用校验的唯一依据，
 * 因此每次工具调用返回的来源都必须显式登记，且只保存稳定类型、主键和名称快照。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import {
  AiSourceType,
  AiSourceUsage,
  Prisma,
} from '../../../../generated/prisma';
import type { AiToolSourceRef } from '../../types/ai-tool-source.types';

/** 一条已登记来源依赖的稳定标识与展示名称。 */
export type RegisteredAiSource = {
  /** 稳定的业务来源类型。 */
  sourceType: AiSourceType;
  /** 来源在自身业务表中的主键字符串。 */
  sourceId: string;
  /** 登记时的来源名称快照。 */
  label: string;
};

@Injectable()
export class AiSourceDependencyService {
  /** 注入唯一 Prisma 服务；来源登记始终跟随调用方事务，不单独开启事务。 */
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 在调用方事务内登记本次工具调用读取的全部来源。
   * 同一 Run 内重复读取同一来源只保留一条记录，因此重放和多次调用都不会放大依赖集合。
   */
  async registerReadSourcesInTransaction(
    transaction: Prisma.TransactionClient,
    input: {
      /** 来源归属的 Run 标识。 */
      runId: string;
      /** 产生这些来源的工具调用标识。 */
      toolCallId: string;
      /** 工具声明的来源标识集合。 */
      sources: readonly AiToolSourceRef[];
    },
  ): Promise<void> {
    if (input.sources.length === 0) {
      return;
    }

    await transaction.aiSourceDependency.createMany({
      data: input.sources.map((source) => ({
        runId: input.runId,
        toolCallId: input.toolCallId,
        sourceType: this.toPrismaSourceType(source.sourceType),
        sourceId: source.sourceId,
        usage: AiSourceUsage.READ,
        label: source.label,
      })),
      skipDuplicates: true,
    });
  }

  /** 列出一次 Run 已登记的全部来源依赖，供来源权限复核与历史展示使用。 */
  async listRunSources(runId: string): Promise<RegisteredAiSource[]> {
    const sources = await this.prisma.aiSourceDependency.findMany({
      where: { runId },
      orderBy: [{ createdAt: 'asc' }],
      select: { sourceType: true, sourceId: true, label: true },
    });

    return sources.map((source) => ({
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      label: source.label,
    }));
  }

  /** 将工具声明的来源类型转换为 Prisma 持久化枚举。 */
  private toPrismaSourceType(
    sourceType: AiToolSourceRef['sourceType'],
  ): AiSourceType {
    switch (sourceType) {
      case 'DECISION':
        return AiSourceType.DECISION;
      case 'DECISION_PROPOSAL':
        return AiSourceType.DECISION_PROPOSAL;
      case 'DECISION_VOTE_ROUND':
        return AiSourceType.DECISION_VOTE_ROUND;
      case 'DECISION_RESOLUTION':
        return AiSourceType.DECISION_RESOLUTION;
    }
  }
}
