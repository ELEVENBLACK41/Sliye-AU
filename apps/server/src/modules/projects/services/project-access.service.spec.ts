/**
 * 本文件验证项目成员与私有分区的统一授权边界。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  ProjectMemberRole,
  ProjectStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { ProjectAccessService } from './project-access.service';

/** 创建项目授权测试使用的当前用户上下文。 */
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

describe('ProjectAccessService', () => {
  it('即使是超级管理员，正常读取也必须存在项目成员关系', async () => {
    const prisma = {
      project: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProjectAccessService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.findProject(createAuthorization(), 10),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
      status: 404,
    });
    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
          members: { some: { userId: 7 } },
        },
      }),
    );
  });

  it('私有分区可见条件应要求显式分区成员关系', () => {
    const service = new ProjectAccessService({} as PrismaService);

    expect(service.buildVisibleAreaWhere(7, 10)).toEqual({
      projectId: 10,
      project: { members: { some: { userId: 7 } } },
      OR: [
        { type: DiscussionAreaType.PUBLIC },
        { members: { some: { userId: 7 } } },
      ],
    });
  });

  it('项目负责人未加入私有分区时也不应穿透内容', async () => {
    const prisma = {
      discussionArea: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new ProjectAccessService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.findArea(createAuthorization(), 10, 40),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DISCUSSION_AREA_NOT_FOUND,
      status: 404,
    });
  });

  it('只有私有分区管理员才可在该分区管理会议', () => {
    const service = new ProjectAccessService({} as PrismaService);
    const context = {
      id: 40,
      projectId: 10,
      type: DiscussionAreaType.PRIVATE,
      status: DiscussionAreaStatus.ACTIVE,
      projectStatus: ProjectStatus.ACTIVE,
      projectMemberRole: ProjectMemberRole.OWNER,
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
