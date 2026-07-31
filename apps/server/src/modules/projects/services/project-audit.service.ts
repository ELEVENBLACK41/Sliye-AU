/**
 * 本文件负责通过独立只读入口审计访问私有分区内容，并记录不可变访问日志。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { ProjectAuditReadResponse } from '@workspace/contracts/projects';
import { randomUUID } from 'node:crypto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import { DiscussionAreaType } from '../../../generated/prisma';
import type {
  AuthorizationContext,
  RequestClientMeta,
} from '../../auth/types/auth.types';
import { ProjectAuditReadDto } from '../dto/project-audit-read.dto';
import {
  toProjectChatMessage,
  type ProjectChatMessageRecord,
} from '../projects.mapper';
import { projectChatMessageInclude } from './project-chat.service';

@Injectable()
export class ProjectAuditService {
  /** 注入 Prisma 以在同一事务中写审计日志并读取私有快照。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 记录原因后只读返回目标私有分区或会议的最近消息。 */
  async readPrivateContent(
    actor: AuthorizationContext,
    dto: ProjectAuditReadDto,
    meta: RequestClientMeta,
  ): Promise<ProjectAuditReadResponse> {
    const area = await this.prisma.discussionArea.findFirst({
      where: {
        id: dto.areaId,
        projectId: dto.projectId,
        type: DiscussionAreaType.PRIVATE,
      },
      select: {
        id: true,
        name: true,
        project: { select: { id: true, title: true } },
      },
    });
    if (!area) {
      throw new BusinessException({
        code: API_ERROR_CODES.PROJECT_AUDIT_PRIVATE_TARGET_REQUIRED,
        message: '审计入口只能读取明确存在的私有讨论分区',
        status: 404,
      });
    }

    const meeting =
      dto.meetingId === undefined
        ? null
        : await this.prisma.meetingSession.findFirst({
            where: { id: dto.meetingId, areaId: area.id },
            select: { id: true, title: true },
          });
    if (dto.meetingId !== undefined && !meeting) {
      throw new BusinessException({
        code: API_ERROR_CODES.MEETING_NOT_FOUND,
        message: '审计目标会议不存在或不属于目标私有分区',
        status: 404,
      });
    }

    const accessedAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const auditLog = await tx.collaborationAuditLog.create({
        data: {
          actorId: actor.userId,
          projectId: area.project.id,
          areaId: area.id,
          meetingId: meeting?.id,
          action: 'PRIVATE_CONTENT_READ',
          reason: dto.reason,
          requestId: meta.requestId ?? randomUUID(),
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          createdAt: accessedAt,
        },
        select: { id: true },
      });
      const messages = await tx.discussionMessage.findMany({
        where: {
          areaId: area.id,
          ...(meeting ? { meetingId: meeting.id } : {}),
        },
        include: projectChatMessageInclude,
        orderBy: { id: 'desc' },
        take: 100,
      });

      return { auditLog, messages: messages.reverse() };
    });

    return {
      auditLogId: result.auditLog.id,
      project: area.project,
      area: { id: area.id, name: area.name },
      meeting,
      messages: result.messages.map((message) =>
        toProjectChatMessage(message as ProjectChatMessageRecord),
      ),
      accessedAt: accessedAt.toISOString(),
    };
  }
}
