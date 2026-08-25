/**
 * 本文件验证决策上下文读取只在统一授权范围之上叠加主键条件，
 * 未命中时返回 null，并把查询结果映射为结构化上下文事实。
 * 不连接真实数据库，Prisma 与授权服务均为内存 mock。
 */

import type { DataScope } from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { AuthorizationService } from '../../auth/services/authorization.service';
import { DecisionContextService } from './decision-context.service';

/** 构造一个仅供测试使用的授权上下文。 */
const AUTHORIZATION_CONTEXT: AuthorizationContext = {
  userId: 42,
  deptId: null,
  isSuperAdmin: false,
  roleCodes: new Set<string>(),
  deniedPermissions: new Set<string>(),
  grants: new Map<string, ReadonlySet<DataScope>>(),
};

/** 构造一条仅供测试使用的 Prisma 决策查询结果。 */
function createDecisionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 17,
    title: '缓存方案评审',
    description: '需要在 Redis 与本地缓存之间确定一版方案。',
    status: 'DISCUSSING',
    areaId: null,
    decidedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-08-20T01:00:00.000Z'),
    updatedAt: new Date('2026-08-25T08:00:00.000Z'),
    project: { id: 3, title: '基础设施项目' },
    area: null,
    department: { name: '技术部' },
    owner: { id: 7, name: '张三' },
    creator: { id: 9, name: null },
    _count: {
      participants: 6,
      proposals: 2,
      voteRounds: 1,
      resolutions: 0,
    },
    resolutions: [],
    ...overrides,
  };
}

describe('DecisionContextService', () => {
  /** 创建 mock Prisma 与授权服务的服务实例。 */
  function createService() {
    const findFirst = jest.fn().mockResolvedValue(createDecisionRow());
    const prisma = { decision: { findFirst } };
    const buildDecisionWhere = jest.fn().mockResolvedValue({
      AND: [{ project: { members: { some: { userId: 42 } } } }],
    });
    const authorizationService = {
      buildDecisionWhere,
    } as unknown as AuthorizationService;

    return {
      service: new DecisionContextService(prisma as never, authorizationService),
      findFirst,
      buildDecisionWhere,
    };
  }

  it('主键条件叠加在统一授权范围之上，权限过滤发生在 SQL 层', async () => {
    const { service, findFirst, buildDecisionWhere } = createService();

    await service.getContext(AUTHORIZATION_CONTEXT, 17);

    expect(buildDecisionWhere).toHaveBeenCalledWith(
      AUTHORIZATION_CONTEXT,
      'decision:read',
    );
    expect(findFirst.mock.calls[0][0].where).toEqual({
      AND: [
        { AND: [{ project: { members: { some: { userId: 42 } } } }] },
        { id: 17 },
      ],
    });
  });

  it('决策不存在或不在授权范围内时返回 null', async () => {
    const { service, findFirst } = createService();
    findFirst.mockResolvedValue(null);

    await expect(
      service.getContext(AUTHORIZATION_CONTEXT, 999),
    ).resolves.toBeNull();
  });

  it('把查询结果映射为结构化上下文，未命名用户退回稳定占位', async () => {
    const { service } = createService();

    await expect(
      service.getContext(AUTHORIZATION_CONTEXT, 17),
    ).resolves.toEqual({
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
      creatorDisplayName: '用户#9',
      participantCount: 6,
      proposalCount: 2,
      voteRoundCount: 1,
      resolutionCount: 0,
      latestActiveResolution: null,
      decidedAt: null,
      archivedAt: null,
      createdAt: new Date('2026-08-20T01:00:00.000Z'),
      updatedAt: new Date('2026-08-25T08:00:00.000Z'),
    });
  });

  it('分区决策标记为 AREA 范围，并返回最新一条生效决议摘要', async () => {
    const { service, findFirst } = createService();
    findFirst.mockResolvedValue(
      createDecisionRow({
        areaId: 5,
        area: { name: '架构小组' },
        status: 'RESOLVED',
        decidedAt: new Date('2026-08-24T06:00:00.000Z'),
        _count: {
          participants: 6,
          proposals: 2,
          voteRounds: 1,
          resolutions: 1,
        },
        resolutions: [
          {
            id: 88,
            title: '采用 Redis 集中缓存',
            kind: 'FINAL',
            decidedAt: new Date('2026-08-24T06:00:00.000Z'),
          },
        ],
      }),
    );

    const context = await service.getContext(AUTHORIZATION_CONTEXT, 17);

    expect(context?.scope).toBe('AREA');
    expect(context?.areaName).toBe('架构小组');
    expect(context?.latestActiveResolution).toEqual({
      resolutionId: 88,
      title: '采用 Redis 集中缓存',
      kind: 'FINAL',
      decidedAt: new Date('2026-08-24T06:00:00.000Z'),
    });
  });

  it('只读取仍然生效的决议，避免把已撤销决议当作当前结论', async () => {
    const { service, findFirst } = createService();

    await service.getContext(AUTHORIZATION_CONTEXT, 17);

    expect(findFirst.mock.calls[0][0].select.resolutions.where).toEqual({
      status: 'ACTIVE',
    });
  });
});
