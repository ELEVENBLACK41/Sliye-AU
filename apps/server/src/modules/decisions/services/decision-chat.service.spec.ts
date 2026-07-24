/**
 * 本文件验证决策群聊的游标分页、读取范围、参与者发言、幂等和回复边界。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../../database/prisma.service';
import {
  DecisionStatus,
  DiscussionMessageType,
  DiscussionSpaceStatus,
} from '../../../generated/prisma';
import type { AuthorizationService } from '../../auth/services/authorization.service';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { MeetingContextService } from '../../meetings/services/meeting-context.service';
import type { DecisionChatGateway } from '../gateways/decision-chat.gateway';
import { DecisionChatService } from './decision-chat.service';
import type { DecisionChatTicketService } from './decision-chat-ticket.service';

/** 创建群聊测试使用的授权上下文。 */
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

/** 创建通过数据范围校验后的决策群聊上下文记录。 */
function createDecisionContext(
  overrides: Partial<{
    status: DecisionStatus;
    spaceStatus: DiscussionSpaceStatus;
    isParticipant: boolean;
  }> = {},
) {
  return {
    id: 20,
    status: overrides.status ?? DecisionStatus.DISCUSSING,
    spaceId: 80,
    space: {
      status: overrides.spaceStatus ?? DiscussionSpaceStatus.ACTIVE,
    },
    participants: overrides.isParticipant === false ? [] : [{ id: 30 }],
  };
}

/** 创建可被群聊 Mapper 转换的消息数据库记录。 */
function createMessageRecord(
  id: number,
  overrides: Partial<{
    spaceId: number;
    content: string;
    clientMessageId: string;
    replyToId: number | null;
    meetingId: number | null;
  }> = {},
) {
  const createdAt = new Date(
    `2026-07-22T10:00:${String(id).padStart(2, '0')}.000Z`,
  );

  return {
    id,
    spaceId: overrides.spaceId ?? 80,
    authorId: 7,
    clientMessageId:
      overrides.clientMessageId ?? '4f8ea9c0-6e12-4af3-81aa-6b4812449b72',
    meetingId: overrides.meetingId ?? null,
    replyToId: overrides.replyToId ?? null,
    pinnedById: null,
    type: DiscussionMessageType.TEXT,
    content: overrides.content ?? `消息 ${id}`,
    pinnedAt: null,
    editedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
    author: { id: 7, name: '成员甲', avatarUrl: null },
    replyTo: null,
  };
}

/** 使用相同 Prisma 与授权替身创建群聊服务。 */
function createService(
  prisma: PrismaService,
  authorizationService: AuthorizationService,
  ticketService: DecisionChatTicketService = {
    issue: jest.fn(),
  } as unknown as DecisionChatTicketService,
  gateway: DecisionChatGateway = {
    broadcastMessageCreated: jest.fn(),
  } as unknown as DecisionChatGateway,
  meetingContextService: MeetingContextService = {
    resolveWritableMeetingId: jest.fn(
      (_decisionId: number, meetingId: number | undefined) =>
        Promise.resolve(meetingId ?? null),
    ),
  } as unknown as MeetingContextService,
): DecisionChatService {
  return new DecisionChatService(
    prisma,
    authorizationService,
    ticketService,
    gateway,
    meetingContextService,
  );
}

describe('DecisionChatService', () => {
  it('首次查询应返回最新一页并按消息 ID 正序排列', async () => {
    const messages = Array.from({ length: 31 }, (_, index) =>
      createMessageRecord(31 - index),
    );
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(createDecisionContext()),
      },
      discussionMessage: { findMany: jest.fn().mockResolvedValue(messages) },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    const result = await service.list(createAuthorization(), 20, {});

    expect(result.items).toHaveLength(30);
    expect(result.items[0].id).toBe(2);
    expect(result.items.at(-1)?.id).toBe(31);
    expect(result).toMatchObject({ hasMore: true, nextCursor: 2 });
    expect(prisma.discussionMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { spaceId: 80 },
        orderBy: { id: 'desc' },
        take: 31,
      }),
    );
  });

  it('向后补齐时应只返回游标之后的消息并提供下一游标', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(createDecisionContext()),
      },
      discussionMessage: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            createMessageRecord(11),
            createMessageRecord(12),
            createMessageRecord(13),
          ]),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    const result = await service.list(createAuthorization(), 20, {
      direction: 'after',
      cursor: 10,
      limit: 2,
      meetingId: 90,
    });

    expect(result.items.map((message) => message.id)).toEqual([11, 12]);
    expect(result).toMatchObject({ hasMore: true, nextCursor: 12 });
    expect(prisma.discussionMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { spaceId: 80, meetingId: 90, id: { gt: 10 } },
        orderBy: { id: 'asc' },
        take: 3,
      }),
    );
  });

  it('数据范围内非参与者可以查看消息但不能发送', async () => {
    const prisma = {
      decision: {
        findFirst: jest
          .fn()
          .mockResolvedValue(createDecisionContext({ isParticipant: false })),
      },
      discussionMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(service.list(createAuthorization(), 20, {})).resolves.toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    await expect(
      service.create(createAuthorization(), 20, {
        clientMessageId: '4f8ea9c0-6e12-4af3-81aa-6b4812449b72',
        content: '只读用户不能发送',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_CHAT_SEND_NOT_ALLOWED,
    });
    expect(prisma.discussionMessage.findFirst).not.toHaveBeenCalled();
  });

  it('相同幂等键和载荷重试时应返回原消息而不重复创建', async () => {
    const originalMessage = createMessageRecord(41, {
      content: '需要保留的消息',
    });
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(createDecisionContext()),
      },
      discussionMessage: {
        findFirst: jest.fn().mockResolvedValue(originalMessage),
        create: jest.fn(),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const gateway = { broadcastMessageCreated: jest.fn() };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
      undefined,
      gateway as unknown as DecisionChatGateway,
    );

    await expect(
      service.create(createAuthorization(), 20, {
        clientMessageId: originalMessage.clientMessageId,
        content: '需要保留的消息',
      }),
    ).resolves.toMatchObject({ id: 41, content: '需要保留的消息' });
    expect(prisma.discussionMessage.create).not.toHaveBeenCalled();
    expect(gateway.broadcastMessageCreated).not.toHaveBeenCalled();
  });

  it('相同幂等键用于不同内容时应返回 409', async () => {
    const originalMessage = createMessageRecord(41, { content: '原消息' });
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(createDecisionContext()),
      },
      discussionMessage: {
        findFirst: jest.fn().mockResolvedValue(originalMessage),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.create(createAuthorization(), 20, {
        clientMessageId: originalMessage.clientMessageId,
        content: '篡改后的消息',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_CHAT_IDEMPOTENCY_CONFLICT,
    });
  });

  it('决策或群组结束后应拒绝新消息', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(
          createDecisionContext({
            status: DecisionStatus.RESOLVED,
            spaceStatus: DiscussionSpaceStatus.READ_ONLY,
          }),
        ),
      },
      discussionMessage: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.create(createAuthorization(), 20, {
        clientMessageId: '4f8ea9c0-6e12-4af3-81aa-6b4812449b72',
        content: '不能再发送',
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_CHAT_READ_ONLY,
    });
  });

  it('回复其他群组或不存在的消息时应统一返回 404', async () => {
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(createDecisionContext()),
      },
      discussionMessage: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
    );

    await expect(
      service.create(createAuthorization(), 20, {
        clientMessageId: '4f8ea9c0-6e12-4af3-81aa-6b4812449b72',
        content: '回复消息',
        replyToId: 999,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_CHAT_MESSAGE_NOT_FOUND,
    });
  });

  it('参与者在可写群组中应成功创建文字消息', async () => {
    const createdMessage = createMessageRecord(42, { content: '新消息' });
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(createDecisionContext()),
      },
      discussionMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdMessage),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const gateway = { broadcastMessageCreated: jest.fn() };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
      undefined,
      gateway as unknown as DecisionChatGateway,
    );

    await expect(
      service.create(createAuthorization(), 20, {
        clientMessageId: createdMessage.clientMessageId,
        content: '新消息',
        meetingId: 90,
      }),
    ).resolves.toMatchObject({ id: 42, content: '新消息' });
    expect(prisma.discussionMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          spaceId: 80,
          authorId: 7,
          clientMessageId: createdMessage.clientMessageId,
          content: '新消息',
          replyToId: undefined,
          meetingId: 90,
        },
      }),
    );
    expect(gateway.broadcastMessageCreated).toHaveBeenCalledWith(
      20,
      expect.objectContaining({ id: 42, content: '新消息' }),
    );
  });

  it('消息落库后广播失败仍应返回已保存消息', async () => {
    const createdMessage = createMessageRecord(43, { content: '已经落库' });
    const prisma = {
      decision: {
        findFirst: jest.fn().mockResolvedValue(createDecisionContext()),
      },
      discussionMessage: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdMessage),
      },
    };
    const authorizationService = {
      buildDecisionWhere: jest.fn().mockResolvedValue({ deptId: 3 }),
    };
    const gateway = {
      broadcastMessageCreated: jest.fn(() => {
        throw new Error('socket unavailable');
      }),
    };
    const service = createService(
      prisma as unknown as PrismaService,
      authorizationService as unknown as AuthorizationService,
      undefined,
      gateway as unknown as DecisionChatGateway,
    );

    await expect(
      service.create(createAuthorization(), 20, {
        clientMessageId: createdMessage.clientMessageId,
        content: '已经落库',
      }),
    ).resolves.toMatchObject({ id: 43, content: '已经落库' });
  });
});
