/**
 * 本文件验证提案和投票轮次的来源可见性必须复用所属决策的数据范围，
 * 且查询只返回主键，不把业务内容带入 AI 历史投影。
 */

import type { PrismaService } from '../../../database/prisma.service';
import type { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { DecisionVisibilityService } from './decision-visibility.service';

/** 创建来源可见性测试使用的授权上下文。 */
const AUTHORIZATION_CONTEXT: AuthorizationContext = {
  userId: 42,
  deptId: null,
  isSuperAdmin: false,
  roleCodes: new Set(),
  deniedPermissions: new Set(),
  grants: new Map(),
};

/** 创建可检查查询条件的 Prisma 与授权服务替身。 */
function createHarness() {
  const scopeWhere = { project: { members: { some: { userId: 42 } } } };
  const buildDecisionWhere = jest.fn().mockResolvedValue(scopeWhere);
  const findProposalMany = jest.fn().mockResolvedValue([{ id: 11 }]);
  const findVoteRoundMany = jest.fn().mockResolvedValue([{ id: 21 }]);
  const prisma = {
    decisionProposal: { findMany: findProposalMany },
    decisionVoteRound: { findMany: findVoteRoundMany },
  };
  const authorizationService = {
    buildDecisionWhere,
  } as unknown as AuthorizationService;

  return {
    service: new DecisionVisibilityService(
      prisma as unknown as PrismaService,
      authorizationService,
    ),
    buildDecisionWhere,
    findProposalMany,
    findVoteRoundMany,
  };
}

describe('DecisionVisibilityService', () => {
  /** 验证提案可见性按父决策权限过滤并限制返回字段。 */
  it('按所属决策权限批量过滤提案来源', async () => {
    const { service, buildDecisionWhere, findProposalMany } = createHarness();

    await expect(
      service.filterVisibleProposalIds(AUTHORIZATION_CONTEXT, [11, 12]),
    ).resolves.toEqual(new Set([11]));
    expect(buildDecisionWhere).toHaveBeenCalledWith(
      AUTHORIZATION_CONTEXT,
      'decision:read',
    );
    expect(findProposalMany).toHaveBeenCalledWith({
      where: {
        id: { in: [11, 12] },
        decision: {
          is: {
            AND: [{ project: { members: { some: { userId: 42 } } } }],
          },
        },
      },
      select: { id: true },
    });
  });

  /** 验证投票轮次可见性使用同一父决策权限边界。 */
  it('按所属决策权限批量过滤投票轮次来源', async () => {
    const { service, findVoteRoundMany } = createHarness();

    await expect(
      service.filterVisibleVoteRoundIds(AUTHORIZATION_CONTEXT, [21, 22]),
    ).resolves.toEqual(new Set([21]));
    expect(findVoteRoundMany).toHaveBeenCalledWith({
      where: {
        id: { in: [21, 22] },
        decision: {
          is: {
            AND: [{ project: { members: { some: { userId: 42 } } } }],
          },
        },
      },
      select: { id: true },
    });
  });

  /** 验证空来源不触发授权和数据库查询。 */
  it('空来源集合直接返回空集合', async () => {
    const { service, buildDecisionWhere, findProposalMany, findVoteRoundMany } =
      createHarness();

    await expect(
      service.filterVisibleProposalIds(AUTHORIZATION_CONTEXT, []),
    ).resolves.toEqual(new Set());
    await expect(
      service.filterVisibleVoteRoundIds(AUTHORIZATION_CONTEXT, []),
    ).resolves.toEqual(new Set());
    expect(buildDecisionWhere).not.toHaveBeenCalled();
    expect(findProposalMany).not.toHaveBeenCalled();
    expect(findVoteRoundMany).not.toHaveBeenCalled();
  });
});
