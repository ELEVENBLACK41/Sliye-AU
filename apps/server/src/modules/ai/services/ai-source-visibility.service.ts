/**
 * 本文件负责批量判断每个 Run 依赖的业务来源当前是否仍对用户可见。
 *
 * 判定是**实时计算**的：不持久化任何“已锁定”标记。
 * 来源权限恢复后，历史内容随之自动重新可见——AI 历史本质是“当时读到了什么”的
 * 审计记录，权限恢复了就应当恢复可见；持久化锁定状态没有明确的解锁责任人，
 * 容易变成永远堆积的死数据（对应 D2-07 的选择）。
 *
 * 判定按批处理：消息列表一次会返回几十条消息，逐条查权限会退化成 N+1 查询。
 * 未知来源类型一律按**不可见**处理（fail closed）：将来新增来源类型却忘了补判定时，
 * 结果是历史被过度隐藏而不是越权泄漏。
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { DecisionVisibilityService } from '../../decisions/services/decision-visibility.service';
import { AiSourceType, AiSourceUsage } from '../../../generated/prisma';

/** 一条来源依赖在判定过程中使用的最小信息。 */
type AiSourceDependencyRow = {
  runId: string;
  sourceType: AiSourceType;
  sourceId: string;
};

@Injectable()
export class AiSourceVisibilityService {
  /** 注入 Prisma 与决策可见性服务；决策范围判断不在本模块重复实现。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionVisibilityService: DecisionVisibilityService,
  ) {}

  /**
   * 批量判断给定 Run 的全部来源是否仍然可见。
   *
   * 返回的 Map 覆盖传入的每一个 Run：没有登记任何来源的 Run 视为可见，
   * 因为它没有依赖任何需要权限的业务数据。
   */
  async evaluateRunsSourceVisibility(
    authorization: AuthorizationContext,
    runIds: readonly string[],
  ): Promise<Map<string, boolean>> {
    const visibility = new Map<string, boolean>(
      runIds.map((runId) => [runId, true]),
    );
    if (runIds.length === 0) {
      return visibility;
    }

    const dependencies = await this.prisma.aiSourceDependency.findMany({
      where: { runId: { in: [...runIds] }, usage: AiSourceUsage.READ },
      select: { runId: true, sourceType: true, sourceId: true },
    });
    if (dependencies.length === 0) {
      return visibility;
    }

    const visibleSourceKeys = await this.resolveVisibleSourceKeys(
      authorization,
      dependencies,
    );
    for (const dependency of dependencies) {
      if (!visibleSourceKeys.has(this.toSourceKey(dependency))) {
        visibility.set(dependency.runId, false);
      }
    }

    return visibility;
  }

  /**
   * 按来源类型分组批量解析可见来源，返回可见来源的键集合。
   * 每种类型只发一次查询，避免随消息数量线性增长。
   */
  private async resolveVisibleSourceKeys(
    authorization: AuthorizationContext,
    dependencies: readonly AiSourceDependencyRow[],
  ): Promise<Set<string>> {
    const decisionIds = this.collectNumericIds(
      dependencies,
      AiSourceType.DECISION,
    );
    const resolutionIds = this.collectNumericIds(
      dependencies,
      AiSourceType.DECISION_RESOLUTION,
    );
    const [visibleDecisionIds, visibleResolutionIds] = await Promise.all([
      this.decisionVisibilityService.filterVisibleDecisionIds(
        authorization,
        decisionIds,
      ),
      this.decisionVisibilityService.filterVisibleResolutionIds(
        authorization,
        resolutionIds,
      ),
    ]);

    const visibleKeys = new Set<string>();
    for (const decisionId of visibleDecisionIds) {
      visibleKeys.add(`${AiSourceType.DECISION}:${decisionId}`);
    }
    for (const resolutionId of visibleResolutionIds) {
      visibleKeys.add(`${AiSourceType.DECISION_RESOLUTION}:${resolutionId}`);
    }

    return visibleKeys;
  }

  /**
   * 取出某一来源类型下可解析为数字主键的标识。
   * 无法解析的标识不会进入查询，因此也不会出现在可见集合中，
   * 最终按 fail closed 判定为不可见。
   */
  private collectNumericIds(
    dependencies: readonly AiSourceDependencyRow[],
    sourceType: AiSourceType,
  ): number[] {
    const ids = new Set<number>();
    for (const dependency of dependencies) {
      if (dependency.sourceType !== sourceType) {
        continue;
      }

      const parsed = Number(dependency.sourceId);
      if (Number.isInteger(parsed)) {
        ids.add(parsed);
      }
    }

    return [...ids];
  }

  /** 生成来源在可见集合中的稳定键。 */
  private toSourceKey(dependency: AiSourceDependencyRow): string {
    return `${dependency.sourceType}:${dependency.sourceId}`;
  }
}
