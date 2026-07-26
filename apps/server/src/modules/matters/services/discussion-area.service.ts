/**
 * 本文件负责讨论分区列表、私有分区创建、资料更新和显式成员管理。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DiscussionAreaMember,
  DiscussionAreaMemberListResponse,
  DiscussionAreaListResponse,
  DiscussionAreaSummary,
} from '@workspace/contracts/matters';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaMemberRole,
  DiscussionAreaStatus,
  DiscussionAreaType,
  MatterMemberRole,
  MatterStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { AddDiscussionAreaMemberDto } from '../dto/add-discussion-area-member.dto';
import { CreateDiscussionAreaDto } from '../dto/create-discussion-area.dto';
import { UpdateDiscussionAreaDto } from '../dto/update-discussion-area.dto';
import {
  toDiscussionAreaMember,
  toDiscussionAreaSummary,
  type DiscussionAreaSummaryRecord,
} from '../matters.mapper';
import { MatterChatGateway } from '../gateways/matter-chat.gateway';
import { MatterAccessService } from './matter-access.service';

/** 分区摘要查询统一加载的关系。 */
function createAreaSummaryInclude(userId: number) {
  return {
    createdBy: { select: { id: true, name: true, avatarUrl: true } },
    members: {
      where: { userId },
      select: { role: true },
      take: 1,
    },
    _count: { select: { members: true } },
    matter: { select: { _count: { select: { members: true } } } },
  } as const;
}

/** 分区成员响应统一加载的用户摘要。 */
const areaMemberInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class DiscussionAreaService {
  /** 注入数据库、分区授权和实时连接服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: MatterAccessService,
    private readonly gateway: MatterChatGateway,
  ) {}

  /** 查询当前用户可见的公共区和私有分区列表。 */
  async list(
    authorization: AuthorizationContext,
    matterId: number,
  ): Promise<DiscussionAreaListResponse> {
    await this.accessService.findMatter(authorization, matterId);
    const areas = await this.prisma.discussionArea.findMany({
      where: this.accessService.buildVisibleAreaWhere(
        authorization.userId,
        matterId,
      ),
      include: createAreaSummaryInclude(authorization.userId),
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return areas.map((area) =>
      toDiscussionAreaSummary(area as DiscussionAreaSummaryRecord),
    );
  }

  /** 由议事管理员创建私有分区并将创建人设置为分区管理员。 */
  async create(
    authorization: AuthorizationContext,
    matterId: number,
    dto: CreateDiscussionAreaDto,
  ): Promise<DiscussionAreaSummary> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertMatterActive(context.status);

    const memberIds = [
      ...new Set([authorization.userId, ...(dto.memberIds ?? [])]),
    ];
    const validMemberCount = await this.prisma.matterMember.count({
      where: { matterId, userId: { in: memberIds } },
    });
    if (validMemberCount !== memberIds.length) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_MEMBER_INVALID,
        message: '私有分区初始成员必须全部是当前议事成员',
        status: 400,
      });
    }

    const area = await this.prisma.discussionArea.create({
      data: {
        matterId,
        createdById: authorization.userId,
        name: dto.name,
        description: dto.description,
        type: DiscussionAreaType.PRIVATE,
        members: {
          createMany: {
            data: memberIds.map((userId) => ({
              userId,
              role:
                userId === authorization.userId
                  ? DiscussionAreaMemberRole.MANAGER
                  : DiscussionAreaMemberRole.MEMBER,
            })),
          },
        },
      },
      include: createAreaSummaryInclude(authorization.userId),
    });

    return toDiscussionAreaSummary(area);
  }

  /** 更新分区资料；公共区不允许单独修改生命周期。 */
  async update(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
    dto: UpdateDiscussionAreaDto,
  ): Promise<DiscussionAreaSummary> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertMatterActive(context.status);
    const area = await this.findAreaForManagement(matterId, areaId);

    if (area.type === DiscussionAreaType.PUBLIC && dto.status !== undefined) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_PUBLIC_PROTECTED,
        message: '公共讨论区状态只能跟随议事生命周期变化',
        status: 409,
      });
    }

    const updated = await this.prisma.discussionArea.update({
      where: { id: area.id },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        archivedAt:
          dto.status === DiscussionAreaStatus.ARCHIVED
            ? new Date()
            : dto.status === DiscussionAreaStatus.ACTIVE
              ? null
              : undefined,
      },
      include: createAreaSummaryInclude(authorization.userId),
    });

    return toDiscussionAreaSummary(updated);
  }

  /** 查询私有分区成员；议事管理员无需读取私有消息即可管理成员。 */
  async listMembers(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
  ): Promise<DiscussionAreaMemberListResponse> {
    await this.assertCanManageOrViewAreaMembers(
      authorization,
      matterId,
      areaId,
    );
    const members = await this.prisma.discussionAreaMember.findMany({
      where: { areaId },
      include: areaMemberInclude,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return members.map(toDiscussionAreaMember);
  }

  /** 由议事管理员把一名现有议事成员加入私有分区。 */
  async addMember(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
    dto: AddDiscussionAreaMemberDto,
  ): Promise<DiscussionAreaMember> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertMatterActive(context.status);
    await this.assertPrivateArea(matterId, areaId);

    const isMatterMember = await this.prisma.matterMember.findUnique({
      where: { matterId_userId: { matterId, userId: dto.userId } },
      select: { id: true },
    });
    if (!isMatterMember) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_MEMBER_INVALID,
        message: '只有当前议事成员可以加入私有分区',
        status: 400,
      });
    }

    const created = await this.prisma.discussionAreaMember.createMany({
      data: { areaId, userId: dto.userId, role: dto.role },
      skipDuplicates: true,
    });
    if (created.count !== 1) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_MEMBER_ALREADY_EXISTS,
        message: '该用户已经是当前私有分区成员',
        status: 409,
      });
    }

    const member = await this.prisma.discussionAreaMember.findUnique({
      where: { areaId_userId: { areaId, userId: dto.userId } },
      include: areaMemberInclude,
    });
    if (!member) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
        message: '私有分区成员创建失败，请稍后重试',
        status: 500,
      });
    }

    return toDiscussionAreaMember(member);
  }

  /** 移除私有分区成员并立即撤销其会议和实时访问。 */
  async removeMember(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
    userId: number,
  ): Promise<{ removed: true }> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertMatterActive(context.status);
    await this.assertPrivateArea(matterId, areaId);

    const member = await this.prisma.discussionAreaMember.findUnique({
      where: { areaId_userId: { areaId, userId } },
      select: { id: true, role: true },
    });
    if (!member) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_MEMBER_NOT_FOUND,
        message: '目标私有分区成员不存在',
        status: 404,
      });
    }

    if (member.role === DiscussionAreaMemberRole.MANAGER) {
      const managerCount = await this.prisma.discussionAreaMember.count({
        where: { areaId, role: DiscussionAreaMemberRole.MANAGER },
      });
      if (managerCount <= 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DISCUSSION_AREA_MEMBER_INVALID,
          message: '私有分区必须至少保留一名分区管理员',
          status: 409,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.meetingParticipant.deleteMany({
        where: { userId, meeting: { areaId } },
      });
      await tx.discussionAreaMember.delete({ where: { id: member.id } });
    });
    this.gateway.disconnectUserFromArea(matterId, areaId, userId);

    return { removed: true };
  }

  /** 查询议事管理员可管理的分区元数据。 */
  private async findAreaForManagement(matterId: number, areaId: number) {
    const area = await this.prisma.discussionArea.findFirst({
      where: { id: areaId, matterId },
      select: { id: true, type: true },
    });
    if (!area) {
      this.accessService.throwAreaNotFound();
    }

    return area;
  }

  /** 断言目标是当前议事中的私有分区。 */
  private async assertPrivateArea(
    matterId: number,
    areaId: number,
  ): Promise<void> {
    const area = await this.findAreaForManagement(matterId, areaId);
    if (area.type !== DiscussionAreaType.PRIVATE) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_PUBLIC_PROTECTED,
        message: '公共讨论区不维护独立成员列表',
        status: 409,
      });
    }
  }

  /** 允许议事管理员管理成员，也允许私有分区成员查看本区成员。 */
  private async assertCanManageOrViewAreaMembers(
    authorization: AuthorizationContext,
    matterId: number,
    areaId: number,
  ): Promise<void> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    const area = await this.findAreaForManagement(matterId, areaId);
    if (area.type !== DiscussionAreaType.PRIVATE) {
      throw new BusinessException({
        code: API_ERROR_CODES.DISCUSSION_AREA_PUBLIC_PROTECTED,
        message: '公共讨论区直接继承议事成员列表',
        status: 409,
      });
    }

    const isMatterManager =
      context.memberRole === MatterMemberRole.OWNER ||
      context.memberRole === MatterMemberRole.MANAGER;
    if (isMatterManager) {
      return;
    }

    await this.accessService.findArea(authorization, matterId, areaId);
  }

  /** 断言只有进行中的议事可以调整分区和分区成员。 */
  private assertMatterActive(status: MatterStatus): void {
    if (status !== MatterStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_READ_ONLY,
        message: '当前议事已经关闭或归档，不能调整讨论分区',
        status: 409,
      });
    }
  }
}
