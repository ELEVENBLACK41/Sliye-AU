/**
 * 本文件负责议事列表、详情、创建和生命周期流转。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  MatterDetail,
  MatterListResponse,
} from '@workspace/contracts/matters';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaStatus,
  DiscussionAreaType,
  MatterMemberRole,
  MatterStatus,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { CreateMatterDto } from '../dto/create-matter.dto';
import { UpdateMatterStatusDto } from '../dto/update-matter-status.dto';
import {
  toMatterDetail,
  toMatterSummary,
  type MatterSummaryRecord,
} from '../matters.mapper';
import { MatterAccessService } from './matter-access.service';

/** 议事摘要查询统一加载的关系。 */
const matterSummaryInclude = {
  department: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  owner: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { members: true, areas: true, decisions: true } },
  areas: { select: { _count: { select: { meetings: true } } } },
} as const;

@Injectable()
export class MatterCoreService {
  /** 注入数据库、系统授权和议事成员授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly accessService: MatterAccessService,
  ) {}

  /** 查询当前用户作为成员加入且未归档的议事列表。 */
  async list(authorization: AuthorizationContext): Promise<MatterListResponse> {
    const matters = await this.prisma.matter.findMany({
      where: {
        status: { not: MatterStatus.ARCHIVED },
        members: { some: { userId: authorization.userId } },
      },
      include: matterSummaryInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    return matters.map((matter) =>
      toMatterSummary(matter as MatterSummaryRecord),
    );
  }

  /** 查询当前用户作为成员加入的单项议事详情。 */
  async get(
    authorization: AuthorizationContext,
    matterId: number,
  ): Promise<MatterDetail> {
    await this.accessService.findMatter(authorization, matterId);
    return this.findDetail(matterId, authorization.userId);
  }

  /** 在授权部门内创建议事、负责人关系和唯一公共讨论区。 */
  async create(
    authorization: AuthorizationContext,
    dto: CreateMatterDto,
  ): Promise<MatterDetail> {
    await this.authorizationService.assertDepartmentInScope(
      authorization,
      'matter:create',
      dto.departmentId,
    );

    const matter = await this.prisma.$transaction(async (tx) =>
      tx.matter.create({
        data: {
          title: dto.title,
          description: dto.description,
          deptId: dto.departmentId,
          createdById: authorization.userId,
          ownerId: authorization.userId,
          members: {
            create: {
              userId: authorization.userId,
              role: MatterMemberRole.OWNER,
            },
          },
          areas: {
            create: {
              createdById: authorization.userId,
              name: '公共讨论',
              description: '议事成员统一同步信息、结论和公开摘要的公共区域。',
              type: DiscussionAreaType.PUBLIC,
              status: DiscussionAreaStatus.ACTIVE,
              publicKey: 'PUBLIC',
            },
          },
        },
        select: { id: true },
      }),
    );

    return this.findDetail(matter.id, authorization.userId);
  }

  /** 由议事负责人或管理员关闭、重开或归档议事。 */
  async updateStatus(
    authorization: AuthorizationContext,
    matterId: number,
    dto: UpdateMatterStatusDto,
  ): Promise<MatterDetail> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertStatusTransition(context.status, dto.status);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.matter.updateMany({
        where: { id: matterId, status: context.status },
        data: {
          status: dto.status,
          closedAt:
            dto.status === MatterStatus.CLOSED
              ? now
              : dto.status === MatterStatus.ACTIVE
                ? null
                : undefined,
          archivedAt: dto.status === MatterStatus.ARCHIVED ? now : undefined,
        },
      });

      if (updated.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.MATTER_INVALID_STATUS_TRANSITION,
          message: '议事状态已经发生变化，请刷新后重试',
          status: 409,
        });
      }

      await tx.discussionArea.updateMany({
        where: { matterId, type: DiscussionAreaType.PUBLIC },
        data: {
          status:
            dto.status === MatterStatus.ACTIVE
              ? DiscussionAreaStatus.ACTIVE
              : dto.status === MatterStatus.CLOSED
                ? DiscussionAreaStatus.READ_ONLY
                : DiscussionAreaStatus.ARCHIVED,
          closedAt:
            dto.status === MatterStatus.CLOSED
              ? now
              : dto.status === MatterStatus.ACTIVE
                ? null
                : undefined,
          archivedAt: dto.status === MatterStatus.ARCHIVED ? now : undefined,
        },
      });
    });

    return this.findDetail(matterId, authorization.userId);
  }

  /** 校验议事生命周期只允许关闭、重开和不可逆归档。 */
  private assertStatusTransition(
    currentStatus: MatterStatus,
    targetStatus: MatterStatus,
  ): void {
    const allowed =
      (currentStatus === MatterStatus.ACTIVE &&
        (targetStatus === MatterStatus.CLOSED ||
          targetStatus === MatterStatus.ARCHIVED)) ||
      (currentStatus === MatterStatus.CLOSED &&
        (targetStatus === MatterStatus.ACTIVE ||
          targetStatus === MatterStatus.ARCHIVED));

    if (!allowed) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_INVALID_STATUS_TRANSITION,
        message: '当前议事状态不能进入目标状态',
        status: 409,
      });
    }
  }

  /** 读取刚创建或更新后的完整议事详情。 */
  private async findDetail(
    matterId: number,
    userId: number,
  ): Promise<MatterDetail> {
    const matter = await this.prisma.matter.findUnique({
      where: { id: matterId },
      include: {
        ...matterSummaryInclude,
        members: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!matter) {
      this.accessService.throwMatterNotFound();
    }

    const publicAreas = await this.prisma.discussionArea.findMany({
      where: { matterId, type: DiscussionAreaType.PUBLIC },
      select: { id: true },
      take: 1,
    });

    return toMatterDetail({
      ...(matter as MatterSummaryRecord & {
        members: Array<{ role: MatterMemberRole }>;
      }),
      publicAreas,
    });
  }
}
