/**
 * 本文件集中处理议事成员、私有分区、生命周期和实时连接的授权边界。
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
  MatterMemberRole,
  MatterStatus,
  type Prisma,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';

/** 议事成员授权校验后返回的稳定上下文。 */
export type MatterAccessContext = {
  /** 议事主键。 */
  id: number;
  /** 议事生命周期状态。 */
  status: MatterStatus;
  /** 当前用户在议事中的角色。 */
  memberRole: MatterMemberRole;
};

/** 分区可见性校验后返回的稳定上下文。 */
export type DiscussionAreaAccessContext = {
  /** 分区主键。 */
  id: number;
  /** 分区所属议事主键。 */
  matterId: number;
  /** 分区可见边界类型。 */
  type: DiscussionAreaType;
  /** 分区生命周期状态。 */
  status: DiscussionAreaStatus;
  /** 所属议事生命周期状态。 */
  matterStatus: MatterStatus;
  /** 当前用户的议事角色。 */
  matterMemberRole: MatterMemberRole;
  /** 当前用户的私有分区角色；公共区为 `null`。 */
  areaMemberRole: DiscussionAreaMemberRole | null;
};

/** 允许管理议事资料、成员和分区元数据的议事角色。 */
const matterManagerRoles = new Set<MatterMemberRole>([
  MatterMemberRole.OWNER,
  MatterMemberRole.MANAGER,
]);

@Injectable()
export class MatterAccessService {
  /** 注入 Prisma 以统一执行成员关系与会话状态校验。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 构造当前用户可见的分区查询条件，管理员 ALL 权限不会穿透私有区。 */
  buildVisibleAreaWhere(
    userId: number,
    matterId?: number,
  ): Prisma.DiscussionAreaWhereInput {
    return {
      ...(matterId === undefined ? {} : { matterId }),
      matter: { members: { some: { userId } } },
      OR: [
        { type: DiscussionAreaType.PUBLIC },
        { members: { some: { userId } } },
      ],
    };
  }

  /** 查询当前用户的议事成员上下文，越权与不存在统一返回 404。 */
  async findMatter(
    authorization: AuthorizationContext,
    matterId: number,
  ): Promise<MatterAccessContext> {
    const matter = await this.prisma.matter.findFirst({
      where: {
        id: matterId,
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

    const memberRole = matter?.members[0]?.role;
    if (!matter || !memberRole) {
      this.throwMatterNotFound();
    }

    return { id: matter.id, status: matter.status, memberRole };
  }

  /** 查询当前用户可见的分区上下文，私有区负责人未加入时仍返回 404。 */
  async findArea(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
  ): Promise<DiscussionAreaAccessContext> {
    const area = await this.prisma.discussionArea.findFirst({
      where: {
        id: areaId,
        matterId,
        AND: [this.buildVisibleAreaWhere(authorization.userId, matterId)],
      },
      select: {
        id: true,
        matterId: true,
        type: true,
        status: true,
        members: {
          where: { userId: authorization.userId },
          select: { role: true },
          take: 1,
        },
        matter: {
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

    const matterMemberRole = area?.matter.members[0]?.role;
    if (!area || !matterMemberRole) {
      this.throwAreaNotFound();
    }

    return {
      id: area.id,
      matterId: area.matterId,
      type: area.type,
      status: area.status,
      matterStatus: area.matter.status,
      matterMemberRole,
      areaMemberRole: area.members[0]?.role ?? null,
    };
  }

  /** 断言当前用户是议事负责人或议事管理员。 */
  assertMatterManager(context: MatterAccessContext): void {
    if (!matterManagerRoles.has(context.memberRole)) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有议事负责人或议事管理员可以执行该操作',
        status: 403,
      });
    }
  }

  /** 断言当前用户可以在当前分区创建或管理会议。 */
  assertAreaMeetingManager(context: DiscussionAreaAccessContext): void {
    const canManagePublicArea =
      context.type === DiscussionAreaType.PUBLIC &&
      matterManagerRoles.has(context.matterMemberRole);
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

  /** 断言议事及分区均处于允许新增协作内容的状态。 */
  assertAreaWritable(context: DiscussionAreaAccessContext): void {
    if (context.matterStatus !== MatterStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_READ_ONLY,
        message: '当前议事已经关闭或归档，只能查看历史内容',
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
    matterId: number,
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
          matterId,
          AND: [this.buildVisibleAreaWhere(userId, matterId)],
        },
        select: { id: true },
      }),
    ]);

    return Boolean(session && area);
  }

  /** 抛出议事不存在或普通入口越权的统一异常。 */
  throwMatterNotFound(): never {
    throw new BusinessException({
      code: API_ERROR_CODES.MATTER_NOT_FOUND,
      message: '议事不存在或当前账号无权访问',
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
