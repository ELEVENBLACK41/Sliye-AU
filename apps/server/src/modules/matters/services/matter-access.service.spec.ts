/**
 * 本文件验证议事成员与私有分区的统一授权边界。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  MatterMemberRole,
  MatterStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { MatterAccessService } from './matter-access.service';

/** 创建议事授权测试使用的当前用户上下文。 */
function createAuthorization(): AuthorizationContext {
  return {
    userId: 7,
    deptId: 3,
    isSuperAdmin: true,
    roleCodes: new Set(['SUPER_ADMIN']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

describe('MatterAccessService', () => {
  it('即使是超级管理员，正常读取也必须存在议事成员关系', async () => {
    const prisma = {
      matter: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new MatterAccessService(prisma as unknown as PrismaService);

    await expect(
      service.findMatter(createAuthorization(), 10),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.MATTER_NOT_FOUND,
      status: 404,
    });
    expect(prisma.matter.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
          members: { some: { userId: 7 } },
        },
      }),
    );
  });

  it('私有分区可见条件应要求显式分区成员关系', () => {
    const service = new MatterAccessService({} as PrismaService);

    expect(service.buildVisibleAreaWhere(7, 10)).toEqual({
      matterId: 10,
      matter: { members: { some: { userId: 7 } } },
      OR: [
        { type: DiscussionAreaType.PUBLIC },
        { members: { some: { userId: 7 } } },
      ],
    });
  });

  it('议事负责人未加入私有分区时也不应穿透内容', async () => {
    const prisma = {
      discussionArea: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new MatterAccessService(prisma as unknown as PrismaService);

    await expect(
      service.findArea(createAuthorization(), 10, 40),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DISCUSSION_AREA_NOT_FOUND,
      status: 404,
    });
  });

  it('只有私有分区管理员才可在该分区管理会议', () => {
    const service = new MatterAccessService({} as PrismaService);
    const context = {
      id: 40,
      matterId: 10,
      type: DiscussionAreaType.PRIVATE,
      status: DiscussionAreaStatus.ACTIVE,
      matterStatus: MatterStatus.ACTIVE,
      matterMemberRole: MatterMemberRole.OWNER,
      areaMemberRole: DiscussionAreaMemberRole.MEMBER,
    };

    expect(() => service.assertAreaMeetingManager(context)).toThrow();
    expect(() =>
      service.assertAreaMeetingManager({
        ...context,
        areaMemberRole: DiscussionAreaMemberRole.MANAGER,
      }),
    ).not.toThrow();
  });
});
