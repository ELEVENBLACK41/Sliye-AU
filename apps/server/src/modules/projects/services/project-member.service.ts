/**
 * 本文件负责项目成员查询、新增、角色变更、移除和实时访问撤销。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  ProjectMember,
  ProjectMemberCandidateListQuery,
  ProjectMemberCandidateListResponse,
  ProjectMemberListResponse,
} from '@workspace/contracts/projects';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  ProjectMemberRole,
  ProjectStatus,
  UserStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { AddProjectMemberDto } from '../dto/add-project-member.dto';
import { UpdateProjectMemberDto } from '../dto/update-project-member.dto';
import { toProjectMember } from '../projects.mapper';
import { ProjectChatGateway } from '../gateways/project-chat.gateway';
import { ProjectAccessService } from './project-access.service';

/** 可加入项目的用户必须完成认证、组织和角色准备。 */
const availableProjectMemberUserWhere = {
  status: UserStatus.ACTIVE,
  emailVerifiedAt: { not: null },
  department: { is: { status: 'ACTIVE' as const } },
  roles: { some: {} },
} as const;

/** 项目成员响应统一加载的用户摘要。 */
const projectMemberInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

@Injectable()
export class ProjectMemberService {
  /** 注入数据库、项目授权和实时连接服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: ProjectAccessService,
    private readonly gateway: ProjectChatGateway,
  ) {}

  /** 查询当前用户可见项目的全部成员。 */
  async list(
    authorization: AuthorizationContext,
    projectId: number,
  ): Promise<ProjectMemberListResponse> {
    await this.accessService.findProject(authorization, projectId);
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: projectMemberInclude,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });

    return members.map(toProjectMember);
  }

  /** 查询项目管理员可添加的用户，并排除当前项目已有成员。 */
  async listCandidates(
    authorization: AuthorizationContext,
    projectId: number,
    query: ProjectMemberCandidateListQuery,
  ): Promise<ProjectMemberCandidateListResponse> {
    const context = await this.accessService.findProject(
      authorization,
      projectId,
    );
    this.accessService.assertProjectManager(context);
    this.assertMemberMutable(context.status);
    const search = query.q?.trim();
    const users = await this.prisma.user.findMany({
      where: {
        ...availableProjectMemberUserWhere,
        projectMemberships: { none: { projectId } },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
                {
                  department: {
                    is: {
                      name: { contains: search, mode: 'insensitive' as const },
                    },
                  },
                },
              ],
            }
          : {}),
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

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      department: user.department!,
    }));
  }

  /** 由项目管理员添加一个启用用户作为项目成员。 */
  async add(
    authorization: AuthorizationContext,
    projectId: number,
    dto: AddProjectMemberDto,
  ): Promise<ProjectMember> {
    const context = await this.accessService.findProject(
      authorization,
      projectId,
    );
    this.accessService.assertProjectManager(context);
    this.assertMemberMutable(context.status);

    const targetUser = await this.prisma.user.findFirst({
      where: { id: dto.userId, ...availableProjectMemberUserWhere },
      select: { id: true },
    });
    if (!targetUser) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_MEMBER_NOT_FOUND,
        message: '目标用户不存在或当前账号不可加入项目',
        status: 404,
      });
    }

    const created = await this.prisma.projectMember.createMany({
      data: { projectId, userId: dto.userId, role: dto.role },
      skipDuplicates: true,
    });
    if (created.count !== 1) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_MEMBER_ALREADY_EXISTS,
        message: '该用户已经是当前项目成员',
        status: 409,
      });
    }

    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: dto.userId } },
      include: projectMemberInclude,
    });
    if (!member) {
      throw new BusinessException({
        code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
        message: '项目成员创建失败，请稍后重试',
        status: 500,
      });
    }

    return toProjectMember(member);
  }

  /** 修改现有非负责人的项目成员角色。 */
  async update(
    authorization: AuthorizationContext,
    projectId: number,
    userId: number,
    dto: UpdateProjectMemberDto,
  ): Promise<ProjectMember> {
    const context = await this.accessService.findProject(
      authorization,
      projectId,
    );
    this.accessService.assertProjectManager(context);
    this.assertMemberMutable(context.status);

    const member = await this.findMutableMember(projectId, userId);
    const updated = await this.prisma.projectMember.update({
      where: { id: member.id },
      data: { role: dto.role },
      include: projectMemberInclude,
    });

    return toProjectMember(updated);
  }

  /** 移除项目成员及其分区、会议和决策参与关系，并立即断开实时连接。 */
  async remove(
    authorization: AuthorizationContext,
    projectId: number,
    userId: number,
  ): Promise<{ removed: true }> {
    const context = await this.accessService.findProject(
      authorization,
      projectId,
    );
    this.accessService.assertProjectManager(context);
    this.assertMemberMutable(context.status);
    const member = await this.findMutableMember(projectId, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.discussionAreaMember.deleteMany({
        where: { userId, area: { projectId } },
      });
      await tx.meetingParticipant.deleteMany({
        where: { userId, meeting: { area: { projectId } } },
      });
      await tx.decisionParticipant.deleteMany({
        where: { userId, decision: { projectId } },
      });
      await tx.projectMember.delete({ where: { id: member.id } });
    });

    this.gateway.disconnectUserFromProject(projectId, userId);
    return { removed: true };
  }

  /** 查询可变更的非负责人项目成员。 */
  private async findMutableMember(projectId: number, userId: number) {
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { id: true, role: true },
    });
    if (!member) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_MEMBER_NOT_FOUND,
        message: '目标项目成员不存在',
        status: 404,
      });
    }
    if (member.role === ProjectMemberRole.OWNER) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_OWNER_PROTECTED,
        message: '项目负责人不能通过普通成员接口修改或移除',
        status: 409,
      });
    }

    return member;
  }

  /** 断言只有进行中的项目允许调整成员。 */
  private assertMemberMutable(status: ProjectStatus): void {
    if (status !== ProjectStatus.ACTIVE) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_MEMBER_CHANGE_NOT_ALLOWED,
        message: '当前项目状态不允许调整成员',
        status: 409,
      });
    }
  }
}
