/**
 * 本文件验证议事成员候选查询会排除已有成员，并与新增成员资格保持一致。
 */
import type { PrismaService } from '../../../database/prisma.service';
import {
  MatterMemberRole,
  MatterStatus,
  UserStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { MatterChatGateway } from '../gateways/matter-chat.gateway';
import type { MatterAccessService } from './matter-access.service';
import { MatterMemberService } from './matter-member.service';

/** 创建议事成员服务测试使用的授权上下文。 */
function createAuthorization(): AuthorizationContext {
  return {
    userId: 7,
    deptId: 3,
    isSuperAdmin: false,
    roleCodes: new Set(['USER']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

describe('MatterMemberService', () => {
  it('应返回尚未加入议事且已经完成账号准备的候选用户', async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 9,
            name: '李雷',
            email: 'lilei@example.com',
            avatarUrl: null,
            department: { id: 3, code: 'RD', name: '研发部' },
          },
        ]),
      },
    };
    const accessService = {
      findMatter: jest.fn().mockResolvedValue({
        id: 10,
        status: MatterStatus.ACTIVE,
        memberRole: MatterMemberRole.OWNER,
      }),
      assertMatterManager: jest.fn(),
    };
    const service = new MatterMemberService(
      prisma as unknown as PrismaService,
      accessService as unknown as MatterAccessService,
      {} as MatterChatGateway,
    );

    await expect(
      service.listCandidates(createAuthorization(), 10, { q: '研发' }),
    ).resolves.toEqual([
      {
        id: 9,
        name: '李雷',
        email: 'lilei@example.com',
        avatarUrl: null,
        department: { id: 3, code: 'RD', name: '研发部' },
      },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        status: UserStatus.ACTIVE,
        emailVerifiedAt: { not: null },
        department: { is: { status: 'ACTIVE' } },
        roles: { some: {} },
        matterMemberships: { none: { matterId: 10 } },
        OR: [
          { name: { contains: '研发', mode: 'insensitive' } },
          { email: { contains: '研发', mode: 'insensitive' } },
          {
            department: {
              is: { name: { contains: '研发', mode: 'insensitive' } },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        department: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }, { id: 'asc' }],
      take: 50,
    });
  });
});
