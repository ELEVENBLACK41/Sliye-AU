/**
 * 本文件负责议事成员查询、新增、角色变更、移除和实时访问撤销。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  MatterMember,
  MatterMemberListResponse,
} from '@workspace/contracts/matters';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  MatterMemberRole,
  MatterStatus,
  UserStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { AddMatterMemberDto } from '../dto/add-matter-member.dto';
import { UpdateMatterMemberDto } from '../dto/update-matter-member.dto';
import { toMatterMember } from '../matters.mapper';
import { MatterChatGateway } from '../gateways/matter-chat.gateway';
import { MatterAccessService } from './matter-access.service';

/** 议事成员响应统一加载的用户摘要。 */
const matterMemberInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class MatterMemberService {
  /** 注入数据库、议事授权和实时连接服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: MatterAccessService,
    private readonly gateway: MatterChatGateway,
  ) {}

  /** 查询当前用户可见议事的全部成员。 */
  async list(
    authorization: AuthorizationContext,
    matterId: number,
  ): Promise<MatterMemberListResponse> {
    await this.accessService.findMatter(authorization, matterId);
    const members = await this.prisma.matterMember.findMany({
      where: { matterId },
      include: matterMemberInclude,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return members.map(toMatterMember);
  }

  /** 由议事管理员添加一个启用用户作为议事成员。 */
  async add(
    authorization: AuthorizationContext,
    matterId: number,
    dto: AddMatterMemberDto,
  ): Promise<MatterMember> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertMemberMutable(context.status);

    const targetUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    if (!targetUser) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_MEMBER_NOT_FOUND,
        message: '目标用户不存在或当前账号不可加入议事',
        status: 404,
      });
    }

    const created = await this.prisma.matterMember.createMany({
      data: { matterId, userId: dto.userId, role: dto.role },
      skipDuplicates: true,
    });
    if (created.count !== 1) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_MEMBER_ALREADY_EXISTS,
        message: '该用户已经是当前议事成员',
        status: 409,
      });
    }

    const member = await this.prisma.matterMember.findUnique({
      where: { matterId_userId: { matterId, userId: dto.userId } },
      include: matterMemberInclude,
    });
    if (!member) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
        message: '议事成员创建失败，请稍后重试',
        status: 500,
      });
    }

    return toMatterMember(member);
  }

  /** 修改现有非负责人的议事成员角色。 */
  async update(
    authorization: AuthorizationContext,
    matterId: number,
    userId: number,
    dto: UpdateMatterMemberDto,
  ): Promise<MatterMember> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertMemberMutable(context.status);

    const member = await this.findMutableMember(matterId, userId);
    const updated = await this.prisma.matterMember.update({
      where: { id: member.id },
      data: { role: dto.role },
      include: matterMemberInclude,
    });

    return toMatterMember(updated);
  }

  /** 移除议事成员及其分区、会议和决策参与关系，并立即断开实时连接。 */
  async remove(
    authorization: AuthorizationContext,
    matterId: number,
    userId: number,
  ): Promise<{ removed: true }> {
    const context = await this.accessService.findMatter(
      authorization,
      matterId,
    );
    this.accessService.assertMatterManager(context);
    this.assertMemberMutable(context.status);
    const member = await this.findMutableMember(matterId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.discussionAreaMember.deleteMany({
        where: { userId, area: { matterId } },
      });
      await tx.meetingParticipant.deleteMany({
        where: { userId, meeting: { area: { matterId } } },
      });
      await tx.decisionParticipant.deleteMany({
        where: { userId, decision: { matterId } },
      });
      await tx.matterMember.delete({ where: { id: member.id } });
    });

    this.gateway.disconnectUserFromMatter(matterId, userId);
    return { removed: true };
  }

  /** 查询可变更的非负责人议事成员。 */
  private async findMutableMember(matterId: number, userId: number) {
    const member = await this.prisma.matterMember.findUnique({
      where: { matterId_userId: { matterId, userId } },
      select: { id: true, role: true },
    });
    if (!member) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_MEMBER_NOT_FOUND,
        message: '目标议事成员不存在',
        status: 404,
      });
    }
    if (member.role === MatterMemberRole.OWNER) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_OWNER_PROTECTED,
        message: '议事负责人不能通过普通成员接口修改或移除',
        status: 409,
      });
    }

    return member;
  }

  /** 断言只有进行中的议事允许调整成员。 */
  private assertMemberMutable(status: MatterStatus): void {
    if (status !== MatterStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.MATTER_MEMBER_CHANGE_NOT_ALLOWED,
        message: '当前议事状态不允许调整成员',
        status: 409,
      });
    }
  }
}
