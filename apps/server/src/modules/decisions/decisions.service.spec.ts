/*
 * @Description: 最小决策服务的数据范围与创建事务单元测试。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../database/prisma.service';
import { DecisionStatus, ParticipantRole } from '../../generated/prisma';
import type { AuthorizationService } from '../auth/services/authorization.service';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { DecisionsService } from './decisions.service';

/** 创建决策测试使用的授权上下文。 */
function createAuthorization(): AuthorizationContext {
  return {
    userId: 7,
    deptId: 3,
    isSuperAdmin: false,
    roleCodes: new Set(['MEMBER']),
    deniedPermissions: new Set(),
    grants: new Map(),
  };
}

/** 创建可被映射为决策详情的数据库记录。 */
function createDecisionRecord() {
  const now = new Date('2026-07-11T00:00:00.000Z');

  return {
    id: 20,
    title: '是否重构权限模块',
    description: null,
    status: DecisionStatus.DRAFT,
    creatorId: 7,
    ownerId: 7,
    deptId: 3,
    decidedAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    department: {
      id: 3,
      code: 'engineering',
      name: '研发部',
    },
    creator: { id: 7, name: '成员甲', avatarUrl: null },
    owner: { id: 7, name: '成员甲', avatarUrl: null },
    _count: { participants: 1 },
    participants: [
      {
        id: 30,
        decisionId: 20,
        userId: 7,
        role: ParticipantRole.OWNER,
        createdAt: now,
        updatedAt: now,
        user: { id: 7, name: '成员甲', avatarUrl: null },
      },
    ],
  };
}

describe('DecisionsService', () => {
  it('决策列表必须使用授权服务生成的数据范围条件', async () => {
    const scopeWhere = { deptId: { in: [3, 4] } };
    const prisma = {
      decision: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue(scopeWhere),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(service.list(createAuthorization())).resolves.toEqual([]);
    expect(prisma.decision.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: scopeWhere }),
    );
  });

  it('不存在和越权访问决策统一返回 404', async () => {
    const prisma = {
      decision: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: -1 }),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(service.get(createAuthorization(), 99)).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_NOT_FOUND,
      status: 404,
    });
  });

  it('创建决策时应校验部门范围并自动创建 OWNER 参与关系', async () => {
    const record = createDecisionRecord();
    let capturedCreateInput: unknown;
    const createDecisionMock = jest.fn((input: unknown) => {
      capturedCreateInput = input;
      return Promise.resolve(record);
    });
    const transaction = {
      decision: { create: createDecisionMock },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const authorizationService = {
      assertDepartmentInScope: jest.fn().mockResolvedValue(undefined),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.create(createAuthorization(), {
        title: record.title,
        departmentId: 3,
      }),
    ).resolves.toMatchObject({ id: 20, participantCount: 1 });
    expect(authorizationService.assertDepartmentInScope).toHaveBeenCalledWith(
      createAuthorization(),
      'decision:create',
      3,
    );
    expect(createDecisionMock).toHaveBeenCalledTimes(1);

    expect(capturedCreateInput).toMatchObject({
      data: {
        creatorId: 7,
        ownerId: 7,
        participants: { create: { userId: 7, role: 'OWNER' } },
      },
    });
  });
});
