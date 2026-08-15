/**
 * 本文件集中处理项目成员、私有分区、生命周期和实时连接的授权边界。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  AuthSessionStatus,
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  ProjectMemberRole,
  ProjectStatus,
  type Prisma,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 项目成员授权校验后返回的稳定上下文。 */
export type ProjectAccessContext = {
  /** 项目主键。 */
  id: number;
  /** 项目生命周期状态。 */
  status: ProjectStatus;
  /** 当前用户在项目中的角色。 */
  memberRole: ProjectMemberRole;
};

/** 分区可见性校验后返回的稳定上下文。 */
export type DiscussionAreaAccessContext = {
  /** 分区主键。 */
  id: number;
  /** 分区所属项目主键。 */
  projectId: number;
  /** 分区可见边界类型。 */
  type: DiscussionAreaType;
  /** 分区生命周期状态。 */
  status: DiscussionAreaStatus;
  /** 所属项目生命周期状态。 */
  projectStatus: ProjectStatus;
  /** 当前用户的项目角色。 */
  projectMemberRole: ProjectMemberRole;
  /** 当前用户的私有分区角色；公共区为 `null`。 */
  areaMemberRole: DiscussionAreaMemberRole | null;
};

/** 允许管理项目资料、成员和分区元数据的项目角色。 */
const projectManagerRoles = new Set<ProjectMemberRole>([
  ProjectMemberRole.OWNER,
  ProjectMemberRole.MANAGER,
]);

@Injectable()
export class ProjectAccessService {
  /** 注入 Prisma 以统一执行成员关系与会话状态校验。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 构造当前用户可见的分区查询条件，管理员 ALL 权限不会穿透私有区。 */
  buildVisibleAreaWhere(
    userId: number,
    projectId?: number,
  ): Prisma.DiscussionAreaWhereInput {
    return {
      ...(projectId === undefined ? {} : { projectId }),
      project: { members: { some: { userId } } },
      OR: [
        { type: DiscussionAreaType.PUBLIC },
        { members: { some: { userId } } },
      ],
    };
  }

  /** 查询当前用户的项目成员上下文，越权与不存在统一返回 404。 */
  async findProject(
    authorization: AuthorizationContext,
    projectId: number,
  ): Promise<ProjectAccessContext> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        members: { some: { userId: authorization.userId } },
      },
      select: {
        id: true,
        status: true,
        members: {
          where: { userId: authorization.userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    const memberRole = project?.members[0]?.role;
    if (!project || !memberRole) {
      this.throwProjectNotFound();
    }

    return { id: project.id, status: project.status, memberRole };
  }

  /** 查询当前用户可见的分区上下文，私有区负责人未加入时仍返回 404。 */
  async findArea(
    authorization: AuthorizationContext,
    projectId: number,
    areaId: number,
  ): Promise<DiscussionAreaAccessContext> {
    const area = await this.prisma.discussionArea.findFirst({
      where: {
        id: areaId,
        projectId,
        AND: [this.buildVisibleAreaWhere(authorization.userId, projectId)],
      },
      select: {
        id: true,
        projectId: true,
        type: true,
        status: true,
        members: {
          where: { userId: authorization.userId },
          select: { role: true },
          take: 1,
        },
        project: {
          select: {
            status: true,
            members: {
              where: { userId: authorization.userId },
              select: { role: true },
              take: 1,
            },
          },
        },
      },
    });

    const projectMemberRole = area?.project.members[0]?.role;
    if (!area || !projectMemberRole) {
      this.throwAreaNotFound();
    }

    return {
      id: area.id,
      projectId: area.projectId,
      type: area.type,
      status: area.status,
      projectStatus: area.project.status,
      projectMemberRole,
      areaMemberRole: area.members[0]?.role ?? null,
    };
  }

  /** 断言当前用户是项目负责人或项目管理员。 */
  assertProjectManager(context: ProjectAccessContext): void {
    if (!projectManagerRoles.has(context.memberRole)) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有项目负责人或项目管理员可以执行该操作',
        status: 403,
      });
    }
  }

  /** 断言当前用户可以在当前分区创建或管理会议。 */
  assertAreaMeetingManager(context: DiscussionAreaAccessContext): void {
    const canManagePublicArea =
      context.type === DiscussionAreaType.PUBLIC &&
      projectManagerRoles.has(context.projectMemberRole);
    const canManagePrivateArea =
      context.type === DiscussionAreaType.PRIVATE &&
      context.areaMemberRole === DiscussionAreaMemberRole.MANAGER;

    if (!canManagePublicArea && !canManagePrivateArea) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有当前分区管理员可以创建或管理会议',
        status: 403,
      });
    }
  }

  /** 断言项目及分区均处于允许新增协作内容的状态。 */
  assertAreaWritable(context: DiscussionAreaAccessContext): void {
    if (context.projectStatus !== ProjectStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_READ_ONLY,
        message: '当前项目已经关闭或归档，只能查看历史内容',
        status: 409,
      });
    }

    if (context.status !== DiscussionAreaStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_READ_ONLY,
        message: '当前讨论分区只读或已归档',
        status: 409,
      });
    }
  }

  /** 校验 Socket Ticket 对应会话仍有效且用户仍能访问目标分区。 */
  async validateRealtimeAccess(
    userId: number,
    sessionId: string,
    projectId: number,
    areaId: number,
  ): Promise<boolean> {
    const [session, area] = await Promise.all([
      this.prisma.authSession.findFirst({
        where: {
          id: sessionId,
          userId,
          status: AuthSessionStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
      this.prisma.discussionArea.findFirst({
        where: {
          id: areaId,
          projectId,
          AND: [this.buildVisibleAreaWhere(userId, projectId)],
        },
        select: { id: true },
      }),
    ]);

    return Boolean(session && area);
  }

  /** 抛出项目不存在或普通入口越权的统一异常。 */
  throwProjectNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.PROJECT_NOT_FOUND,
      message: '项目不存在或当前账号无权访问',
      status: 404,
    });
  }

  /** 抛出分区不存在或普通入口越权的统一异常。 */
  throwAreaNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.DISCUSSION_AREA_NOT_FOUND,
      message: '讨论分区不存在或当前账号无权访问',
      status: 404,
    });
  }
}
