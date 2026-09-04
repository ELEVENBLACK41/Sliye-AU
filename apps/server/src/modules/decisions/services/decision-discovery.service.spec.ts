/**
 * 本文件验证决策发现查询只在统一授权范围之上叠加标题/主键匹配条件，
 * 并把结果裁剪、映射为最小候选摘要。不连接真实数据库，Prisma 与授权服务均为内存 mock。
 */

import type { DataScope } from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { AuthorizationService } from '../../auth/services/authorization.service';
import { DecisionDiscoveryService } from './decision-discovery.service';

/** 构造一个仅供测试使用的授权上下文。 */
const AUTHORIZATION_CONTEXT: AuthorizationContext = {
  userId: 42,
  deptId: null,
  isSuperAdmin: false,
  roleCodes: new Set<string>(),
  deniedPermissions: new Set<string>(),
  grants: new Map<string, ReadonlySet<DataScope>>(),
};

describe('DecisionDiscoveryService', () => {
  /** 创建 mock Prisma 与授权服务的服务实例。 */
  function createService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { decision: { findMany } };
    const buildDecisionWhere = jest.fn().mockResolvedValue({
      AND: [{ project: { members: { some: { userId: 42 } } } }],
    });
    const assertPermission = jest.fn();
    const authorizationService = {
      buildDecisionWhere,
      assertPermission,
    } as unknown as AuthorizationService;

    return {
      service: new DecisionDiscoveryService(
        prisma as never,
        authorizationService,
      ),
      findMany,
      buildDecisionWhere,
      assertPermission,
    };
  }

  it('非数字查询词只按标题模糊匹配，并叠加在统一授权范围之上', async () => {
    const { service, findMany, buildDecisionWhere, assertPermission } =
      createService();

    await service.findCandidates(AUTHORIZATION_CONTEXT, '缓存方案评审', 5);

    expect(buildDecisionWhere).toHaveBeenCalledWith(
      AUTHORIZATION_CONTEXT,
      'decision:read',
    );
    expect(assertPermission).toHaveBeenCalledWith(
      AUTHORIZATION_CONTEXT,
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

    await service.findCandidates(AUTHORIZATION_CONTEXT, '17', 5);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { AND: [{ project: { members: { some: { userId: 42 } } } }] },
            {
              OR: [
                { title: { contains: '17', mode: 'insensitive' } },
                { id: 17 },
              ],
            },
          ],
        },
      }),
    );
  });

  it('limit 会被限制在 1 到 20 之间，避免调用方传入越界数量', async () => {
    const { service, findMany } = createService();

    await service.findCandidates(AUTHORIZATION_CONTEXT, 'x', 999);
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 20 }),
    );

    await service.findCandidates(AUTHORIZATION_CONTEXT, 'x', 0);
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 1 }),
    );
  });

  it('把查询结果映射为最小候选摘要，保留原生 Date 类型', async () => {
    const { service, findMany } = createService();
    const updatedAt = new Date('2026-08-25T08:00:00.000Z');
    findMany.mockResolvedValue([
      {
        id: 17,
        title: '缓存方案评审',
        areaId: null,
        status: 'DISCUSSING',
        updatedAt,
        project: { title: '基础设施项目' },
        area: null,
      },
    ]);

    await expect(
      service.findCandidates(AUTHORIZATION_CONTEXT, '缓存方案', 5),
    ).resolves.toEqual([
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
  });

  it('私有小组决策候选应返回 AREA 范围和分区名称', async () => {
    const { service, findMany } = createService();
    const updatedAt = new Date('2026-08-25T08:00:00.000Z');
    findMany.mockResolvedValue([
      {
        id: 18,
        title: '缓存方案评审',
        areaId: 5,
        status: 'DISCUSSING',
        updatedAt,
        project: { title: '基础设施项目' },
        area: { name: '架构小组' },
      },
    ]);

    await expect(
      service.findCandidates(AUTHORIZATION_CONTEXT, '缓存方案', 5),
    ).resolves.toEqual([
      {
        decisionId: 18,
        title: '缓存方案评审',
        projectTitle: '基础设施项目',
        scope: 'AREA',
        areaName: '架构小组',
        status: 'DISCUSSING',
        updatedAt,
      },
    ]);
  });
});
