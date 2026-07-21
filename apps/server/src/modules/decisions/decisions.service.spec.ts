/*
 * @Description: 决策服务的数据范围、状态流转、参与者和提案事务单元测试。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../database/prisma.service';
import {
  DataScope,
  DecisionEventType,
  DecisionStatus,
  ParticipantRole,
  ProposalStatus,
  UserStatus,
} from '../../generated/prisma';
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

/** 创建可被映射为决策时间线条目的数据库事件记录。 */
function createDecisionEventRecord() {
  const occurredAt = new Date('2026-07-11T00:00:00.000Z');
  const createdAt = new Date('2026-07-11T00:00:01.000Z');

  return {
    id: 40,
    decisionId: 20,
    actorId: 7,
    meetingId: null,
    proposalId: null,
    taskId: null,
    type: DecisionEventType.DECISION_CREATED,
    title: '创建决策',
    payload: { departmentId: 3 },
    before: null,
    after: { status: DecisionStatus.DRAFT },
    occurredAt,
    recordingOffsetMs: null,
    createdAt,
    actor: { id: 7, name: '成员甲', avatarUrl: null },
  };
}

/** 创建新增参与者接口返回的数据库参与关系记录。 */
function createParticipantRecord() {
  const now = new Date('2026-07-12T00:00:00.000Z');

  return {
    id: 31,
    decisionId: 20,
    userId: 8,
    role: ParticipantRole.EDITOR,
    createdAt: now,
    updatedAt: now,
    user: { id: 8, name: '成员乙', avatarUrl: null },
  };
}

/** 创建提案接口返回的数据库提案记录。 */
function createProposalRecord() {
  const now = new Date('2026-07-13T00:00:00.000Z');

  return {
    id: 50,
    decisionId: 20,
    creatorId: 7,
    title: '先抽离权限计算服务',
    description: '稳定权限边界后再迁移调用方。',
    status: ProposalStatus.OPEN,
    acceptedAt: null,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
    creator: { id: 7, name: '成员甲', avatarUrl: null },
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

  it('决策事件时间线应使用读取范围并按发生时间和主键稳定排序', async () => {
    const scopeWhere = { deptId: { in: [3, 4] } };
    const event = createDecisionEventRecord();
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({ events: [event] }),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue(scopeWhere),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.listEvents(createAuthorization(), 20),
    ).resolves.toEqual([
      {
        id: 40,
        type: 'DECISION_CREATED',
        title: '创建决策',
        actor: { id: 7, name: '成员甲', avatarUrl: null },
        meetingId: null,
        proposalId: null,
        taskId: null,
        payload: { departmentId: 3 },
        before: null,
        after: { status: 'DRAFT' },
        occurredAt: '2026-07-11T00:00:00.000Z',
        recordingOffsetMs: null,
        createdAt: '2026-07-11T00:00:01.000Z',
      },
    ]);
    expect(authorizationService.buildDecisionWhere).toHaveBeenCalledWith(
      createAuthorization(),
      'decision:read',
    );
    expect(prisma.decision.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [{ id: 20 }, scopeWhere],
      },
      select: {
        events: {
          include: {
            actor: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  });

  it('可访问决策没有事件时应返回空数组', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({ events: [] }),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.listEvents(createAuthorization(), 20),
    ).resolves.toEqual([]);
  });

  it('查询不存在或越权决策的事件时间线时统一返回 404', async () => {
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

    await expect(
      service.listEvents(createAuthorization(), 99),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_NOT_FOUND,
      status: 404,
    });
  });

  it('决策负责人开始讨论时应原子更新状态并写入状态变更事件', async () => {
    const record = {
      ...createDecisionRecord(),
      status: DecisionStatus.DISCUSSING,
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const createEvent = jest.fn().mockResolvedValue({ id: 41 });
    const transaction = {
      decision: {
        updateMany,
        findUnique: jest.fn().mockResolvedValue(record),
      },
      decisionEvent: { create: createEvent },
    };
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.DRAFT,
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({
        participants: { some: { userId: 7 } },
      }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.updateStatus(createAuthorization(), 20, {
        status: 'DISCUSSING',
      }),
    ).resolves.toMatchObject({ id: 20, status: 'DISCUSSING' });
    expect(authorizationService.buildDecisionWhere).toHaveBeenCalledWith(
      createAuthorization(),
      'decision:update',
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 20, status: 'DRAFT' },
      data: { status: 'DISCUSSING' },
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: {
        decisionId: 20,
        actorId: 7,
        type: 'STATUS_CHANGED',
        title: '开始讨论',
        before: { status: 'DRAFT' },
        after: { status: 'DISCUSSING' },
      },
    });
  });

  it('非负责人且没有 ALL 范围时不能开始讨论', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 8,
          status: DecisionStatus.DRAFT,
        }),
      },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.updateStatus(createAuthorization(), 20, {
        status: 'DISCUSSING',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
      status: 403,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('非草稿决策不能再次开始讨论', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.DISCUSSING,
        }),
      },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.updateStatus(createAuthorization(), 20, {
        status: 'DISCUSSING',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_INVALID_STATUS_TRANSITION,
      status: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('并发请求抢先改变状态时不得重复写入状态事件', async () => {
    const createEvent = jest.fn();
    const transaction = {
      decision: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      decisionEvent: { create: createEvent },
    };
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.DRAFT,
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.updateStatus(createAuthorization(), 20, {
        status: 'DISCUSSING',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_INVALID_STATUS_TRANSITION,
      status: 409,
    });
    expect(createEvent).not.toHaveBeenCalled();
  });

  it('决策负责人查询候选参与者时应过滤不可用用户和现有参与者', async () => {
    const candidates = [
      {
        id: 8,
        name: '成员乙',
        avatarUrl: null,
        department: { id: 3, code: 'DEV', name: '研发部' },
      },
    ];
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.DISCUSSING,
        }),
      },
      user: { findMany: jest.fn().mockResolvedValue(candidates) },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.listParticipantCandidates(createAuthorization(), 20),
    ).resolves.toEqual(candidates);
    expect(authorizationService.buildDecisionWhere).toHaveBeenCalledWith(
      createAuthorization(),
      'decision:update',
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        status: UserStatus.ACTIVE,
        emailVerifiedAt: { not: null },
        deptId: { not: null },
        roles: { some: {} },
        decisionParticipants: { none: { decisionId: 20 } },
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
  });

  it('不存在或越权的决策不能通过候选参与者接口探测', async () => {
    const prisma = {
      decision: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn() },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: -1 }),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.listParticipantCandidates(createAuthorization(), 99),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_NOT_FOUND,
      status: 404,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('非负责人且没有 ALL 范围时不能查看候选参与者', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 9,
          status: DecisionStatus.DRAFT,
        }),
      },
      user: { findMany: jest.fn() },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.listParticipantCandidates(createAuthorization(), 20),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
      status: 403,
    });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('决策负责人添加可用参与者时应原子创建参与关系和事件', async () => {
    const participant = createParticipantRecord();
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue(participant);
    const createEvent = jest.fn().mockResolvedValue({ id: 42 });
    const transaction = {
      decisionParticipant: { createMany, findUnique },
      decisionEvent: { create: createEvent },
    };
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.DISCUSSING,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 8 }) },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.addParticipant(createAuthorization(), 20, {
        userId: 8,
        role: 'EDITOR',
      }),
    ).resolves.toEqual({
      id: 31,
      role: 'EDITOR',
      user: { id: 8, name: '成员乙', avatarUrl: null },
      createdAt: '2026-07-12T00:00:00.000Z',
    });
    expect(authorizationService.buildDecisionWhere).toHaveBeenCalledWith(
      createAuthorization(),
      'decision:update',
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 8,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: { not: null },
        deptId: { not: null },
        roles: { some: {} },
      },
      select: { id: true },
    });
    expect(createMany).toHaveBeenCalledWith({
      data: { decisionId: 20, userId: 8, role: 'EDITOR' },
      skipDuplicates: true,
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: {
        decisionId: 20,
        actorId: 7,
        type: 'PARTICIPANT_ADDED',
        title: '添加参与者',
        payload: { participantId: 31, userId: 8 },
        after: { role: 'EDITOR' },
      },
    });
  });

  it('不存在或越权的决策不能通过新增参与者接口探测', async () => {
    const prisma = {
      decision: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: -1 }),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.addParticipant(createAuthorization(), 99, {
        userId: 8,
        role: 'VIEWER',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_NOT_FOUND,
      status: 404,
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('非负责人且没有 ALL 范围时不能添加参与者', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 9,
          status: DecisionStatus.DRAFT,
        }),
      },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.addParticipant(createAuthorization(), 20, {
        userId: 8,
        role: 'VIEWER',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
      status: 403,
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('已结束决策不能继续添加参与者', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.RESOLVED,
        }),
      },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.addParticipant(createAuthorization(), 20, {
        userId: 8,
        role: 'APPROVER',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_PARTICIPANT_CHANGE_NOT_ALLOWED,
      status: 409,
    });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('不可用目标用户不能加入决策', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.DRAFT,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.addParticipant(createAuthorization(), 20, {
        userId: 8,
        role: 'VIEWER',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_PARTICIPANT_USER_NOT_FOUND,
      status: 404,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('重复参与者应返回稳定冲突且不写入事件', async () => {
    const createEvent = jest.fn();
    const transaction = {
      decisionParticipant: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      decisionEvent: { create: createEvent },
    };
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          ownerId: 7,
          status: DecisionStatus.DISCUSSING,
        }),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 8 }) },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.addParticipant(createAuthorization(), 20, {
        userId: 8,
        role: 'EDITOR',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_PARTICIPANT_ALREADY_EXISTS,
      status: 409,
    });
    expect(transaction.decisionParticipant.findUnique).not.toHaveBeenCalled();
    expect(createEvent).not.toHaveBeenCalled();
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

  it('提案列表必须使用决策读取范围并按创建顺序返回', async () => {
    const proposal = createProposalRecord();
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({ proposals: [proposal] }),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.listProposals(createAuthorization(), 20),
    ).resolves.toEqual([
      {
        id: 50,
        decisionId: 20,
        title: proposal.title,
        description: proposal.description,
        status: 'OPEN',
        creator: { id: 7, name: '成员甲', avatarUrl: null },
        acceptedAt: null,
        closedAt: null,
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T00:00:00.000Z',
      },
    ]);
    expect(authorizationService.buildDecisionWhere).toHaveBeenCalledWith(
      createAuthorization(),
      'decision:read',
    );
    expect(prisma.decision.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: 20 }, { id: 20 }] },
      select: {
        proposals: {
          include: {
            creator: {
              select: { id: true, name: true, avatarUrl: true },
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
  });

  it('负责人创建提案时应原子写入提案和时间线事件', async () => {
    const proposal = createProposalRecord();
    const createProposal = jest.fn().mockResolvedValue(proposal);
    const createEvent = jest.fn().mockResolvedValue({ id: 60 });
    const transaction = {
      decisionProposal: { create: createProposal },
      decisionEvent: { create: createEvent },
    };
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          status: DecisionStatus.DISCUSSING,
          participants: [{ role: ParticipantRole.OWNER }],
        }),
      },
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.createProposal(createAuthorization(), 20, {
        title: proposal.title,
        description: proposal.description,
      }),
    ).resolves.toMatchObject({ id: 50, status: 'OPEN' });
    expect(createProposal).toHaveBeenCalledWith({
      data: {
        decisionId: 20,
        creatorId: 7,
        title: proposal.title,
        description: proposal.description,
      },
      include: {
        creator: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
    expect(createEvent).toHaveBeenCalledWith({
      data: {
        decisionId: 20,
        actorId: 7,
        proposalId: 50,
        type: 'PROPOSAL_CREATED',
        title: '创建提案',
        payload: { proposalId: 50 },
        after: {
          title: proposal.title,
          description: proposal.description,
          status: 'OPEN',
        },
      },
    });
  });

  it('查看者不能创建提案', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          status: DecisionStatus.DISCUSSING,
          participants: [{ role: ParticipantRole.VIEWER }],
        }),
      },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.createProposal(createAuthorization(), 20, { title: '新增方案' }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.ACCESS_DATA_SCOPE_DENIED,
      status: 403,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('已形成决议的决策不能继续创建提案', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue({
          id: 20,
          status: DecisionStatus.RESOLVED,
          participants: [{ role: ParticipantRole.EDITOR }],
        }),
      },
      $transaction: jest.fn(),
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ id: 20 }),
      getScopes: jest.fn().mockReturnValue(new Set([DataScope.PARTICIPATED])),
    };
    const service = new DecisionsService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.createProposal(createAuthorization(), 20, { title: '新增方案' }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_PROPOSAL_CHANGE_NOT_ALLOWED,
      status: 409,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
