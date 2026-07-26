/**
 * 本文件负责决策参与者候选查询、参与者新增和相关时间线事件。
 */
import { Injectable } from '@nestjs/common';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type {
  DecisionParticipant,
  DecisionParticipantCandidateListResponse,
} from '@workspace/contracts/decisions';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../database/prisma.service';
import {
  DecisionEventType,
  DecisionStatus,
  UserStatus,
} from '../../../generated/prisma';
import { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import { AddDecisionParticipantDto } from '../dto/add-decision-participant.dto';
import {
  toDecisionParticipant,
  toDecisionParticipantCandidate,
} from '../decisions.mapper';

/** 仍允许调整参与者的决策状态。 */
const participantMutableStatuses = new Set<DecisionStatus>([
  DecisionStatus.DRAFT,
  DecisionStatus.DISCUSSING,
]);

/** 可被加入决策的用户必须已启用、验证邮箱、归属部门且至少拥有一个角色。 */
const availableParticipantUserWhere = {
  status: UserStatus.ACTIVE,
  emailVerifiedAt: { not: null },
  deptId: { not: null },
  roles: { some: {} },
} as const;

@Injectable()
export class DecisionParticipantService {
  /** 注入数据库与统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 向负责人管理的决策添加参与者，并原子写入参与者新增事件。 */
  async add(
    authorization: AuthorizationContext,
    decisionId: number,
    dto: AddDecisionParticipantDto,
  ): Promise<DecisionParticipant> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      select: {
        id: true,
        matterId: true,
        areaId: true,
        ownerId: true,
        status: true,
      },
    });

    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '决策不存在或当前账号无权访问',
        status: 404,
      });
    }

    if (decision.ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人可以添加参与者',
        status: 403,
      });
    }

    if (!participantMutableStatuses.has(decision.status)) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED,
        message: '当前决策状态不允许添加参与者',
        status: 409,
      });
    }

    const areaId = decision.areaId ?? null;
    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        ...availableParticipantUserWhere,
        ...(areaId === null
          ? { matterMemberships: { some: { matterId: decision.matterId } } }
          : {
              discussionAreaMemberships: {
                some: { areaId },
              },
            }),
      },
      select: { id: true },
    });

    if (!targetUser) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PARTICIPANT_USER_NOT_FOUND,
        message: '目标用户不存在或当前不可加入决策',
        status: 404,
      });
    }

    const participant = await this.prisma.$transaction(async (tx) => {
      const decisionLock = await tx.decision.updateMany({
        where: { id: decision.id, status: decision.status },
        data: { updatedAt: new Date() },
      });
      if (decisionLock.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED,
          message: '决策状态已经变化，请刷新后重试',
          status: 409,
        });
      }

      const createResult = await tx.decisionParticipant.createMany({
        data: {
          decisionId: decision.id,
          userId: targetUser.id,
          role: dto.role,
        },
        skipDuplicates: true,
      });

      if (createResult.count !== 1) {
        throw new BusinessException({
          code: API_ERROR_CODES.DECISION_PARTICIPANT_ALREADY_EXISTS,
          message: '该用户已经是当前决策的参与者',
          status: 409,
        });
      }

      const result = await tx.decisionParticipant.findUnique({
        where: {
          decisionId_userId: {
            decisionId: decision.id,
            userId: targetUser.id,
          },
        },
        include: {
          user: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      });

      if (!result) {
        throw new BusinessException({
          code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
          message: '参与者创建失败，请稍后重试',
          status: 500,
        });
      }

      await tx.decisionEvent.create({
        data: {
          decisionId: decision.id,
          actorId: authorization.userId,
          type: DecisionEventType.PARTICIPANT_ADDED,
          title: '添加参与者',
          payload: {
            participantId: result.id,
            userId: targetUser.id,
          },
          after: { role: result.role },
        },
      });

      return result;
    });

    return toDecisionParticipant(participant);
  }

  /** 查询负责人可以加入当前决策的用户，并排除所有现有参与者。 */
  async listCandidates(
    authorization: AuthorizationContext,
    decisionId: number,
  ): Promise<DecisionParticipantCandidateListResponse> {
    const scopeWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:update',
    );
    const decision = await this.prisma.decision.findFirst({
      where: {
        AND: [{ id: decisionId }, scopeWhere],
      },
      select: {
        id: true,
        matterId: true,
        areaId: true,
        ownerId: true,
        status: true,
      },
    });

    if (!decision) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_NOT_FOUND,
        message: '决策不存在或当前账号无权访问',
        status: 404,
      });
    }

    if (decision.ownerId !== authorization.userId) {
      throw new BusinessException({
        code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
        message: '只有决策负责人可以查看可添加参与者',
        status: 403,
      });
    }

    if (!participantMutableStatuses.has(decision.status)) {
      throw new BusinessException({
        code: API_ERROR_CODES.DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED,
        message: '当前决策状态不允许调整参与者',
        status: 409,
      });
    }

    const areaId = decision.areaId ?? null;
    const users = await this.prisma.user.findMany({
      where: {
        ...availableParticipantUserWhere,
        ...(areaId === null
          ? { matterMemberships: { some: { matterId: decision.matterId } } }
          : {
              discussionAreaMemberships: {
                some: { areaId },
              },
            }),
        decisionParticipants: {
          none: { decisionId: decision.id },
        },
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        department: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return users.map(toDecisionParticipantCandidate);
  }
}
