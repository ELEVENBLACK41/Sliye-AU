/**
 * 本文件负责项目列表、详情、创建和生命周期流转。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  ProjectDetail,
  ProjectListResponse,
} from '@workspace/contracts/projects';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaStatus,
  DiscussionAreaType,
  ProjectMemberRole,
  ProjectStatus,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectStatusDto } from '../dto/update-project-status.dto';
import {
  toProjectDetail,
  toProjectSummary,
  type ProjectSummaryRecord,
} from '../projects.mapper';
import { ProjectAccessService } from './project-access.service';

/** 项目摘要查询统一加载的关系。 */
const projectSummaryInclude = {
  department: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true, avatarUrl: true } },
  owner: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { members: true, areas: true, decisions: true } },
  areas: { select: { _count: { select: { meetings: true } } } },
} as const;

@Injectable()
export class ProjectCoreService {
  /** 注入数据库、系统授权和项目成员授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
    private readonly accessService: ProjectAccessService,
  ) {}

  /** 查询当前用户作为成员加入且未归档的项目列表。 */
  async list(
    authorization: AuthorizationContext,
  ): Promise<ProjectListResponse> {
    const projects = await this.prisma.project.findMany({
      where: {
        status: { not: ProjectStatus.ARCHIVED },
        members: { some: { userId: authorization.userId } },
      },
      include: projectSummaryInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });

    return projects.map((project) =>
      toProjectSummary(project as ProjectSummaryRecord),
    );
  }

  /** 查询当前用户作为成员加入的单项项目详情。 */
  async get(
    authorization: AuthorizationContext,
    projectId: number,
  ): Promise<ProjectDetail> {
    await this.accessService.findProject(authorization, projectId);
    return this.findDetail(projectId, authorization.userId);
  }

  /** 在授权部门内创建项目、负责人关系和唯一公共讨论区。 */
  async create(
    authorization: AuthorizationContext,
    dto: CreateProjectDto,
  ): Promise<ProjectDetail> {
    await this.authorizationService.assertDepartmentInScope(
      authorization,
      'project:create',
      dto.departmentId,
    );

    const project = await this.prisma.$transaction(async (tx) =>
      tx.project.create({
        data: {
          title: dto.title,
          description: dto.description,
          deptId: dto.departmentId,
          createdById: authorization.userId,
          ownerId: authorization.userId,
          members: {
            create: {
              userId: authorization.userId,
              role: ProjectMemberRole.OWNER,
            },
          },
          areas: {
            create: {
              createdById: authorization.userId,
              name: '公共讨论',
              description: '项目成员统一同步信息和结论的公共讨论区域。',
              type: DiscussionAreaType.PUBLIC,
              status: DiscussionAreaStatus.ACTIVE,
              publicKey: 'PUBLIC',
            },
          },
        },
        select: { id: true },
      }),
    );

    return this.findDetail(project.id, authorization.userId);
  }

  /** 由项目负责人或管理员关闭、重开或归档项目。 */
  async updateStatus(
    authorization: AuthorizationContext,
    projectId: number,
    dto: UpdateProjectStatusDto,
  ): Promise<ProjectDetail> {
    const context = await this.accessService.findProject(
      authorization,
      projectId,
    );
    this.accessService.assertProjectManager(context);
    this.assertStatusTransition(context.status, dto.status);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.project.updateMany({
        where: { id: projectId, status: context.status },
        data: {
          status: dto.status,
          closedAt:
            dto.status === ProjectStatus.CLOSED
              ? now
              : dto.status === ProjectStatus.ACTIVE
                ? null
                : undefined,
          archivedAt: dto.status === ProjectStatus.ARCHIVED ? now : undefined,
        },
      });

      if (updated.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.PROJECT_INVALID_STATUS_TRANSITION,
          message: '项目状态已经发生变化，请刷新后重试',
          status: 409,
        });
      }

      await tx.discussionArea.updateMany({
        where: { projectId, type: DiscussionAreaType.PUBLIC },
        data: {
          status:
            dto.status === ProjectStatus.ACTIVE
              ? DiscussionAreaStatus.ACTIVE
              : dto.status === ProjectStatus.CLOSED
                ? DiscussionAreaStatus.READ_ONLY
                : DiscussionAreaStatus.ARCHIVED,
          closedAt:
            dto.status === ProjectStatus.CLOSED
              ? now
              : dto.status === ProjectStatus.ACTIVE
                ? null
                : undefined,
          archivedAt: dto.status === ProjectStatus.ARCHIVED ? now : undefined,
        },
      });
    });

    return this.findDetail(projectId, authorization.userId);
  }

  /** 校验项目生命周期只允许关闭、重开和不可逆归档。 */
  private assertStatusTransition(
    currentStatus: ProjectStatus,
    targetStatus: ProjectStatus,
  ): void {
    const allowed =
      (currentStatus === ProjectStatus.ACTIVE &&
        (targetStatus === ProjectStatus.CLOSED ||
          targetStatus === ProjectStatus.ARCHIVED)) ||
      (currentStatus === ProjectStatus.CLOSED &&
        (targetStatus === ProjectStatus.ACTIVE ||
          targetStatus === ProjectStatus.ARCHIVED));

    if (!allowed) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_INVALID_STATUS_TRANSITION,
        message: '当前项目状态不能进入目标状态',
        status: 409,
      });
    }
  }

  /** 读取刚创建或更新后的完整项目详情。 */
  private async findDetail(
    projectId: number,
    userId: number,
  ): Promise<ProjectDetail> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        ...projectSummaryInclude,
        members: {
          where: { userId },
          select: { role: true },
          take: 1,
        },
      },
    });

    if (!project) {
      this.accessService.throwProjectNotFound();
    }

    const publicAreas = await this.prisma.discussionArea.findMany({
      where: { projectId, type: DiscussionAreaType.PUBLIC },
      select: { id: true },
      take: 1,
    });

    return toProjectDetail({
      ...(project as ProjectSummaryRecord & {
        members: Array<{ role: ProjectMemberRole }>;
      }),
      publicAreas,
    });
  }
}
