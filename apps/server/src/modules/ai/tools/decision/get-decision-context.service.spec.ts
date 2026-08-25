/**
 * 本文件验证 getDecisionContext 工具执行器只做窄输入校验、权限上下文派生、
 * 委托 decisions 模块查询、输出裁剪映射和来源登记；
 * 数据范围条件的构造细节由 decisions 模块的 `decision-context.service.spec.ts` 覆盖。
 * 不连接真实数据库，全部依赖均为内存 mock。
 */

import { BusinessException } from '../../../../common/exceptions/business.exception';
import type { DecisionContextService } from '../../../decisions/services/decision-context.service';
import type { DecisionContext } from '../../../decisions/types/decision-context.types';
import type { AiPermissionPolicyService } from '../../policies/ai-permission-policy';
import type { AiToolExecutionContext } from '../../types/ai-tool-registry.types';
import { GetDecisionContextToolService } from './get-decision-context.service';

/** 构造一个仅供测试使用的工具执行上下文，字段均来自已领取 Run。 */
const EXECUTION_CONTEXT: AiToolExecutionContext = {
  runId: 'run-001',
  threadId: 'thread-001',
  ownerUserId: 42,
  executionLeaseId: 'lease-001',
  executionLeaseExpiresAt: new Date(Date.now() + 30_000),
};

/** 构造一份仅供测试使用的决策上下文查询结果。 */
function createDecisionContext(
  overrides: Partial<DecisionContext> = {},
): DecisionContext {
  return {
    decisionId: 17,
    title: '缓存方案评审',
    description: '需要在 Redis 与本地缓存之间确定一版方案。',
    status: 'DISCUSSING',
    projectId: 3,
    projectTitle: '基础设施项目',
    scope: 'PROJECT',
    areaName: null,
    departmentName: '技术部',
    ownerDisplayName: '张三',
    creatorDisplayName: '李四',
    participantCount: 6,
    proposalCount: 2,
    voteRoundCount: 1,
    resolutionCount: 0,
    latestActiveResolution: null,
    decidedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-08-20T01:00:00.000Z'),
    updatedAt: new Date('2026-08-25T08:00:00.000Z'),
    ...overrides,
  };
}

describe('GetDecisionContextToolService', () => {
  /** 创建 mock 权限策略与 decisions 模块上下文服务的执行器实例。 */
  function createService() {
    const buildAuthorizationContext = jest
      .fn()
      .mockResolvedValue({ userId: 42 });
    const permissionPolicy = {
      buildAuthorizationContext,
    } as unknown as AiPermissionPolicyService;

    const getContext = jest.fn().mockResolvedValue(createDecisionContext());
    const decisionContextService = {
      getContext,
    } as unknown as DecisionContextService;

    return {
      service: new GetDecisionContextToolService(
        permissionPolicy,
        decisionContextService,
      ),
      buildAuthorizationContext,
      getContext,
    };
  }

  it('暴露与中心注册表一致的稳定工具名称', () => {
    const { service } = createService();

    expect(service.toolName).toBe('getDecisionContext');
  });

  it('决策主键非正整数时拒绝，且不构造权限上下文或委托查询', async () => {
    const { service, buildAuthorizationContext, getContext } = createService();

    await expect(
      service.execute(EXECUTION_CONTEXT, { decisionId: 0 }),
    ).rejects.toThrow(BusinessException);
    await expect(
      service.execute(EXECUTION_CONTEXT, { decisionId: 1.5 }),
    ).rejects.toThrow(BusinessException);
    expect(buildAuthorizationContext).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
  });

  it('用已领取 Run 的 ownerUserId 现取现算权限上下文后再委托查询', async () => {
    const { service, buildAuthorizationContext, getContext } = createService();

    await service.execute(EXECUTION_CONTEXT, { decisionId: 17 });

    expect(buildAuthorizationContext).toHaveBeenCalledWith(42);
    expect(getContext).toHaveBeenCalledWith({ userId: 42 }, 17);
  });

  it('决策不存在或无权访问时抛出同一个未找到错误，不泄漏存在性', async () => {
    const { service, getContext } = createService();
    getContext.mockResolvedValue(null);

    await expect(
      service.execute(EXECUTION_CONTEXT, { decisionId: 999 }),
    ).rejects.toMatchObject({ code: 'DECISION.NOT_FOUND' });
  });

  it('把决策上下文映射为工具输出契约，并登记决策来源', async () => {
    const { service } = createService();

    const result = await service.execute(EXECUTION_CONTEXT, {
      decisionId: 17,
    });

    expect(result.output).toEqual({
      decisionId: 17,
      title: '缓存方案评审',
      summary: '需要在 Redis 与本地缓存之间确定一版方案。',
      status: 'DISCUSSING',
      projectId: 3,
      projectTitle: '基础设施项目',
      scope: 'PROJECT',
      areaName: null,
      departmentName: '技术部',
      ownerDisplayName: '张三',
      creatorDisplayName: '李四',
      participantCount: 6,
      proposalCount: 2,
      voteRoundCount: 1,
      resolutionCount: 0,
      latestActiveResolution: null,
      decidedAt: null,
      archivedAt: null,
      createdAt: '2026-08-20T01:00:00.000Z',
      updatedAt: '2026-08-25T08:00:00.000Z',
    });
    expect(result.sources).toEqual([
      { sourceType: 'DECISION', sourceId: '17', label: '缓存方案评审' },
    ]);
  });

  it('存在生效决议时同时登记决议来源，并把决议时间转为 ISO 字符串', async () => {
    const { service, getContext } = createService();
    getContext.mockResolvedValue(
      createDecisionContext({
        status: 'RESOLVED',
        resolutionCount: 1,
        latestActiveResolution: {
          resolutionId: 88,
          title: '采用 Redis 集中缓存',
          kind: 'FINAL',
          decidedAt: new Date('2026-08-24T06:00:00.000Z'),
        },
        decidedAt: new Date('2026-08-24T06:00:00.000Z'),
      }),
    );

    const result = await service.execute(EXECUTION_CONTEXT, {
      decisionId: 17,
    });

    expect(result.output.latestActiveResolution).toEqual({
      resolutionId: 88,
      title: '采用 Redis 集中缓存',
      kind: 'FINAL',
      decidedAt: '2026-08-24T06:00:00.000Z',
    });
    expect(result.sources).toEqual([
      { sourceType: 'DECISION', sourceId: '17', label: '缓存方案评审' },
      {
        sourceType: 'DECISION_RESOLUTION',
        sourceId: '88',
        label: '采用 Redis 集中缓存',
      },
    ]);
  });

  it('超长描述会被截断，空描述归一化为 null', async () => {
    const { service, getContext } = createService();
    getContext.mockResolvedValue(
      createDecisionContext({ description: 'A'.repeat(600) }),
    );

    const truncated = await service.execute(EXECUTION_CONTEXT, {
      decisionId: 17,
    });
    expect(truncated.output.summary).toBe(`${'A'.repeat(500)}…`);

    getContext.mockResolvedValue(createDecisionContext({ description: '   ' }));
    const blank = await service.execute(EXECUTION_CONTEXT, { decisionId: 17 });
    expect(blank.output.summary).toBeNull();
  });
});
