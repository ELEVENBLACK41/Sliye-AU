/**
 * 本文件验证 findDecisionCandidates 只在统一授权范围之上叠加标题/主键匹配条件，
 * 并把结果裁剪、映射为受控候选摘要。不连接真实数据库，Prisma 与授权相关依赖均为内存 mock。
 */

import { BusinessException } from '../../../common/exceptions/business.exception';
import type { AuthorizationService } from '../../auth/services/authorization.service';
import type { AiPermissionPolicyService } from '../policies/ai-permission-policy';
import type { AiToolExecutionContext } from '../types/ai-tool-registry.types';
import { AiDecisionDiscoveryService } from './ai-decision-discovery.service';

/** 构造一个仅供测试使用的工具执行上下文，字段均来自已领取 Run。 */
const EXECUTION_CONTEXT: AiToolExecutionContext = {
  runId: 'run-001',
  threadId: 'thread-001',
  ownerUserId: 42,
  executionLeaseId: 'lease-001',
  executionLeaseExpiresAt: new Date(Date.now() + 30_000),
};

describe('AiDecisionDiscoveryService', () => {
  /** 创建 mock Prisma、授权服务与权限策略的服务实例。 */
  function createService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { decision: { findMany } };
    const buildDecisionWhere = jest.fn().mockResolvedValue({
      AND: [{ project: { members: { some: { userId: 42 } } } }],
    });
    const authorizationService = {
      buildDecisionWhere,
    } as unknown as AuthorizationService;
    const buildAuthorizationContext = jest
      .fn()
      .mockResolvedValue({ userId: 42 });
    const permissionPolicy = {
      buildAuthorizationContext,
    } as unknown as AiPermissionPolicyService;

    return {
      service: new AiDecisionDiscoveryService(
        prisma as never,
        authorizationService,
        permissionPolicy,
      ),
      findMany,
      buildDecisionWhere,
      buildAuthorizationContext,
    };
  }

  it('查询词为空时拒绝，且不构造权限上下文或访问数据库', async () => {
    const { service, buildAuthorizationContext, findMany } = createService();

    await expect(
      service.findDecisionCandidates(EXECUTION_CONTEXT, { query: '   ' }),
    ).rejects.toThrow(BusinessException);
    expect(buildAuthorizationContext).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('非数字查询词只按标题模糊匹配，并叠加在统一授权范围之上', async () => {
    const { service, findMany, buildAuthorizationContext, buildDecisionWhere } =
      createService();

    await service.findDecisionCandidates(EXECUTION_CONTEXT, {
      query: '缓存方案评审',
    });

    expect(buildAuthorizationContext).toHaveBeenCalledWith(42);
    expect(buildDecisionWhere).toHaveBeenCalledWith(
      { userId: 42 },
      'decision:read',
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { AND: [{ project: { members: { some: { userId: 42 } } } }] },
            {
              OR: [
                {
                  title: { contains: '缓存方案评审', mode: 'insensitive' },
                },
              ],
            },
          ],
        },
        take: 5,
      }),
    );
  });

  it('纯数字查询词额外允许按主键精确匹配', async () => {
    const { service, findMany } = createService();

    await service.findDecisionCandidates(EXECUTION_CONTEXT, { query: '17' });

    const calledWith = findMany.mock.calls[0][0];
    expect(calledWith.where.AND[1].OR).toEqual([
      { title: { contains: '17', mode: 'insensitive' } },
      { id: 17 },
    ]);
  });

  it('把查询结果裁剪并映射为受控候选摘要', async () => {
    const { service, findMany } = createService();
    const updatedAt = new Date('2026-08-25T08:00:00.000Z');
    findMany.mockResolvedValue([
      {
        id: 17,
        title: '缓存方案评审',
        status: 'DISCUSSING',
        updatedAt,
        project: { title: '基础设施项目' },
      },
    ]);

    await expect(
      service.findDecisionCandidates(EXECUTION_CONTEXT, {
        query: '缓存方案',
      }),
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
