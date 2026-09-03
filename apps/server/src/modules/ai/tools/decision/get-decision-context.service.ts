/**
 * 本文件是 `getDecisionContext` 工具的执行器。
 * 它只负责工具边界的关注点：校验窄输入、从已领取 Run 派生权限上下文、
 * 把结果裁剪映射为工具输出契约并声明本次读取的业务来源；
 * 真实的 Decision 查询与数据范围判断委托给 decisions 模块的 `DecisionContextService`。
 *
 * 注意：本执行器不判断“候选是否唯一”。串联规则（只有本 Run 已发现的唯一候选
 * 才允许读取上下文）由工具编排层统一强制，避免每个工具各写一份可漂移的规则。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../../common/exceptions/business.exception';
import { DecisionContextService } from '../../../decisions/services/decision-context.service';
import type { DecisionContext } from '../../../decisions/types/decision-context.types';
import { AiPermissionPolicyService } from '../../policies/ai-permission-policy';
import type { AiToolExecutionContext } from '../../types/ai-tool-registry.types';
import type {
  AiToolExecutionResult,
  AiToolExecutor,
  AiToolSourceRef,
} from '../../types/ai-tool-source.types';
import { GET_DECISION_CONTEXT_DESCRIPTOR } from './get-decision-context.descriptor';
import type {
  GetDecisionContextInput,
  GetDecisionContextResult,
} from './get-decision-context.types';

/** 决策描述进入模型上下文前的最大字符数，超出部分截断并加省略号。 */
const MAX_DECISION_SUMMARY_LENGTH = 500;

@Injectable()
export class GetDecisionContextToolService implements AiToolExecutor<
  GetDecisionContextInput,
  GetDecisionContextResult
> {
  /** 与中心注册表描述一致的稳定工具名称。 */
  readonly toolName = GET_DECISION_CONTEXT_DESCRIPTOR.name;

  /** 注入 AI 权限上下文构造服务与 decisions 模块的决策上下文服务。 */
  constructor(
    private readonly permissionPolicy: AiPermissionPolicyService,
    private readonly decisionContextService: DecisionContextService,
  ) {}

  /**
   * 执行 `getDecisionContext` 工具：校验输入、鉴权、委托查询、映射输出与来源。
   * 权限过滤发生在 decisions 模块的 SQL 查询层；决策不存在与无权访问返回同一个
   * `DECISION_NOT_FOUND`，因此无法通过错误信息区分无权决策是否存在。
   */
  async execute(
    executionContext: AiToolExecutionContext,
    input: GetDecisionContextInput,
  ): Promise<AiToolExecutionResult<GetDecisionContextResult>> {
    this.assertDecisionId(input.decisionId);

    const authorization = await this.permissionPolicy.buildAuthorizationContext(
      executionContext.ownerUserId,
    );
    const context = await this.decisionContextService.getContext(
      authorization,
      input.decisionId,
    );
    if (!context) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '决策不存在或无权访问',
        status: HttpStatus.NOT_FOUND,
      });
    }

    return {
      output: this.toToolOutput(context),
      sources: this.toSourceRefs(context),
    };
  }

  /** 校验决策主键为正整数，避免把非法值传入业务查询。 */
  private assertDecisionId(decisionId: number): void {
    if (Number.isSafeInteger(decisionId) && decisionId > 0) {
      return;
    }

    throw new BusinessException({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message: '决策主键必须是正整数',
      status: HttpStatus.BAD_REQUEST,
    });
  }

  /** 把决策域查询结果裁剪、映射为工具输出契约，Date 统一转换为 ISO 字符串。 */
  private toToolOutput(context: DecisionContext): GetDecisionContextResult {
    return {
      decisionId: context.decisionId,
      title: context.title,
      summary: this.toSummary(context.description),
      status: context.status,
      projectId: context.projectId,
      projectTitle: context.projectTitle,
      scope: context.scope,
      areaName: context.areaName,
      departmentName: context.departmentName,
      ownerDisplayName: context.ownerDisplayName,
      creatorDisplayName: context.creatorDisplayName,
      participantCount: context.participantCount,
      proposalCount: context.proposalCount,
      voteRoundCount: context.voteRoundCount,
      resolutionCount: context.resolutionCount,
      latestActiveResolution: context.latestActiveResolution
        ? {
            resolutionId: context.latestActiveResolution.resolutionId,
            title: context.latestActiveResolution.title,
            kind: context.latestActiveResolution.kind,
            decidedAt: context.latestActiveResolution.decidedAt.toISOString(),
          }
        : null,
      decidedAt: context.decidedAt?.toISOString() ?? null,
      archivedAt: context.archivedAt?.toISOString() ?? null,
      createdAt: context.createdAt.toISOString(),
      updatedAt: context.updatedAt.toISOString(),
    };
  }

  /** 截断决策描述，避免单条业务记录占满模型上下文预算。 */
  private toSummary(description: string | null): string | null {
    if (description === null) {
      return null;
    }

    const normalized = description.trim();
    if (normalized.length === 0) {
      return null;
    }

    return normalized.length <= MAX_DECISION_SUMMARY_LENGTH
      ? normalized
      : `${normalized.slice(0, MAX_DECISION_SUMMARY_LENGTH)}…`;
  }

  /** 声明本次调用实际读取的业务来源，供 Run 级来源依赖登记使用。 */
  private toSourceRefs(context: DecisionContext): AiToolSourceRef[] {
    const sources: AiToolSourceRef[] = [
      {
        sourceType: 'DECISION',
        sourceId: String(context.decisionId),
        label: context.title,
      },
    ];
    if (context.latestActiveResolution) {
      sources.push({
        sourceType: 'DECISION_RESOLUTION',
        sourceId: String(context.latestActiveResolution.resolutionId),
        label: context.latestActiveResolution.title,
      });
    }

    return sources;
  }
}
