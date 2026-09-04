/**
 * 本文件验证 findDecisionCandidates 工具执行器只做输入校验、权限上下文派生、
 * 委托 decisions 模块查询、输出映射和来源登记；不重复验证查询条件构造细节，
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

  it('暴露与中心注册表一致的稳定工具名称', () => {
    const { service } = createService();

    expect(service.toolName).toBe('findDecisionCandidates');
  });

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

  it('多候选续接时把项目、分区和范围作为重新发现筛选传给业务域', async () => {
    const { service, findCandidates } = createService();

    await service.execute(EXECUTION_CONTEXT, {
      query: '  缓存方案评审  ',
      projectQuery: ' 基础设施项目 ',
      areaQuery: ' 架构小组 ',
      scope: 'AREA',
    });

    expect(findCandidates).toHaveBeenCalledWith(
      { userId: 42 },
      '缓存方案评审',
      5,
      {
        projectQuery: '基础设施项目',
        areaQuery: '架构小组',
        scope: 'AREA',
      },
    );
  });

  it('拒绝非法决策范围筛选，不把未知值当作 AREA', async () => {
    const { service, findCandidates } = createService();

    await expect(
      service.execute(EXECUTION_CONTEXT, {
        query: '缓存方案评审',
        scope: 'UNKNOWN' as never,
      }),
    ).rejects.toThrow('决策范围筛选值无效');
    expect(findCandidates).not.toHaveBeenCalled();
  });

  it('把 decisions 模块返回的候选映射为工具输出契约，并登记为本次读取的来源', async () => {
    const { service, findCandidates } = createService();
    const updatedAt = new Date('2026-08-25T08:00:00.000Z');
    findCandidates.mockResolvedValue([
      {
        decisionId: 17,
        title: '缓存方案评审',
        projectTitle: '基础设施项目',
        scope: 'PROJECT',
        areaName: null,
        status: 'DISCUSSING',
        updatedAt,
      },
    ]);

    await expect(
      service.execute(EXECUTION_CONTEXT, { query: '缓存方案' }),
    ).resolves.toEqual({
      output: {
        candidates: [
          {
            decisionId: 17,
            title: '缓存方案评审',
            projectTitle: '基础设施项目',
            scope: 'PROJECT',
            areaName: null,
            status: 'DISCUSSING',
            updatedAt: updatedAt.toISOString(),
          },
        ],
      },
      sources: [
        { sourceType: 'DECISION', sourceId: '17', label: '缓存方案评审' },
      ],
    });
  });

  it('没有命中任何候选时返回空输出与空来源，不泄漏无权决策的存在', async () => {
    const { service } = createService();

    await expect(
      service.execute(EXECUTION_CONTEXT, { query: '不存在的决策' }),
    ).resolves.toEqual({ output: { candidates: [] }, sources: [] });
  });
});
