/**
 * 本文件验证 findDecisionCandidates 工具执行器只做输入校验、权限上下文派生、
 * 委托 decisions 模块查询和输出映射；不重复验证查询条件构造细节，
 * 那部分已经在 decisions 模块的 `decision-discovery.service.spec.ts` 里覆盖。
 * 不连接真实数据库，全部依赖均为内存 mock。
 */

import { BusinessException } from '../../../../common/exceptions/business.exception';
import type { DecisionDiscoveryService } from '../../../decisions/services/decision-discovery.service';
import type { AiPermissionPolicyService } from '../../policies/ai-permission-policy';
import type { AiToolExecutionContext } from '../../types/ai-tool-registry.types';
import { FindDecisionCandidatesToolService } from './find-decision-candidates.service';

/** 构造一个仅供测试使用的工具执行上下文，字段均来自已领取 Run。 */
const EXECUTION_CONTEXT: AiToolExecutionContext = {
  runId: 'run-001',
  threadId: 'thread-001',
  ownerUserId: 42,
  executionLeaseId: 'lease-001',
  executionLeaseExpiresAt: new Date(Date.now() + 30_000),
};

describe('FindDecisionCandidatesToolService', () => {
  /** 创建 mock 权限策略与 decisions 模块查询服务的执行器实例。 */
  function createService() {
    const buildAuthorizationContext = jest
      .fn()
      .mockResolvedValue({ userId: 42 });
    const permissionPolicy = {
      buildAuthorizationContext,
    } as unknown as AiPermissionPolicyService;

    const findCandidates = jest.fn().mockResolvedValue([]);
    const decisionDiscoveryService = {
      findCandidates,
    } as unknown as DecisionDiscoveryService;

    return {
      service: new FindDecisionCandidatesToolService(
        permissionPolicy,
        decisionDiscoveryService,
      ),
      buildAuthorizationContext,
      findCandidates,
    };
  }

  it('查询词为空时拒绝，且不构造权限上下文或委托查询', async () => {
    const { service, buildAuthorizationContext, findCandidates } =
      createService();

    await expect(
      service.execute(EXECUTION_CONTEXT, { query: '   ' }),
    ).rejects.toThrow(BusinessException);
    expect(buildAuthorizationContext).not.toHaveBeenCalled();
    expect(findCandidates).not.toHaveBeenCalled();
  });

  it('用已领取 Run 的 ownerUserId 派生权限上下文，并把裁剪后的查询词委托给 decisions 模块', async () => {
    const { service, buildAuthorizationContext, findCandidates } =
      createService();

    await service.execute(EXECUTION_CONTEXT, { query: '  缓存方案评审  ' });

    expect(buildAuthorizationContext).toHaveBeenCalledWith(42);
    expect(findCandidates).toHaveBeenCalledWith(
      { userId: 42 },
      '缓存方案评审',
      5,
    );
  });

  it('把 decisions 模块返回的候选映射为工具输出契约，Date 转为 ISO 字符串', async () => {
    const { service, findCandidates } = createService();
    const updatedAt = new Date('2026-08-25T08:00:00.000Z');
    findCandidates.mockResolvedValue([
      {
        decisionId: 17,
        title: '缓存方案评审',
        projectTitle: '基础设施项目',
        status: 'DISCUSSING',
        updatedAt,
      },
    ]);

    await expect(
      service.execute(EXECUTION_CONTEXT, { query: '缓存方案' }),
    ).resolves.toEqual({
      candidates: [
        {
          decisionId: 17,
          title: '缓存方案评审',
          projectTitle: '基础设施项目',
          status: 'DISCUSSING',
          updatedAt: updatedAt.toISOString(),
        },
      ],
    });
  });
});
