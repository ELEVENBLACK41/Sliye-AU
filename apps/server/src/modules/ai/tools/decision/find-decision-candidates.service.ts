/**
 * 本文件是 `findDecisionCandidates` 工具的执行器。
 * 它只负责工具边界的关注点：校验工具输入、从已领取 Run 派生权限上下文、
 * 把结果裁剪映射为工具输出契约；真实的 Decision 查询与数据范围判断
 * 委托给 decisions 模块的 `DecisionDiscoveryService`，避免在 ai 模块里
 * 重复实现或悄悄漂移各业务域自己的查询与权限规则。
 */

import { Injectable } from '@nestjs/common';
import { DecisionDiscoveryService } from '../../../decisions/services/decision-discovery.service';
import { AiPermissionPolicyService } from '../../policies/ai-permission-policy';
import type { AiToolExecutionContext } from '../../types/ai-tool-registry.types';
import { assertAiRequiredText } from '../../services/ai-persistence.utils';
import type {
  FindDecisionCandidatesInput,
  FindDecisionCandidatesResult,
} from './find-decision-candidates.types';

/** 单次调用最多返回的候选决策数量，避免向模型上下文注入过量数据。 */
const MAX_DECISION_CANDIDATES = 5;

@Injectable()
export class FindDecisionCandidatesToolService {
  /** 注入 AI 权限上下文构造服务与 decisions 模块的候选发现服务。 */
  constructor(
    private readonly permissionPolicy: AiPermissionPolicyService,
    private readonly decisionDiscoveryService: DecisionDiscoveryService,
  ) {}

  /**
   * 执行 `findDecisionCandidates` 工具：校验输入、鉴权、委托查询、映射输出。
   * 权限过滤发生在 decisions 模块的 SQL 查询层，未授权记录不会进入结果集，
   * 因此候选数量、顺序和空结果都不会泄漏无权 Decision 的存在。
   */
  async execute(
    executionContext: AiToolExecutionContext,
    input: FindDecisionCandidatesInput,
  ): Promise<FindDecisionCandidatesResult> {
    assertAiRequiredText(input.query, '决策发现查询词');
    const trimmedQuery = input.query.trim();

    const authorization = await this.permissionPolicy.buildAuthorizationContext(
      executionContext.ownerUserId,
    );
    const candidates = await this.decisionDiscoveryService.findCandidates(
      authorization,
      trimmedQuery,
      MAX_DECISION_CANDIDATES,
    );

    return {
      candidates: candidates.map((candidate) => ({
        decisionId: candidate.decisionId,
        title: candidate.title,
        projectTitle: candidate.projectTitle,
        status: candidate.status,
        updatedAt: candidate.updatedAt.toISOString(),
      })),
    };
  }
}
