/**
 * 本文件验证公共讨论消息与决策的关联范围：项目级决策可以被公共消息引用，
 * 私有小组决策只能被所属私有分区引用，不连接真实数据库。
 */

import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { PrismaService } from '../../../database/prisma.service';
import {
  DiscussionAreaStatus,
  DiscussionAreaType,
  DiscussionMessageType,
  ProjectMemberRole,
  ProjectStatus,
} from '../../../generated/prisma';
import type { AuthorizationContext } from '../../auth/types/auth.types';
import type { ProjectChatGateway } from '../gateways/project-chat.gateway';
import type { ProjectChatMessageRecord } from '../projects.mapper';
import type {
  DiscussionAreaAccessContext,
  ProjectAccessService,
} from './project-access.service';
import { ProjectChatService } from './project-chat.service';
import type { ProjectChatTicketService } from './project-chat-ticket.service';

/** 创建项目聊天服务测试使用的请求级授权上下文。 */
const AUTHORIZATION_CONTEXT: AuthorizationContext = {
  userId: 7,
  deptId: 3,
  isSuperAdmin: false,
  roleCodes: new Set(['MEMBER']),
  deniedPermissions: new Set(),
  grants: new Map(),
};

/** 创建公共讨论分区的访问上下文。 */
const PUBLIC_AREA_CONTEXT: DiscussionAreaAccessContext = {
  id: 40,
  projectId: 10,
  type: DiscussionAreaType.PUBLIC,
  status: DiscussionAreaStatus.ACTIVE,
  projectStatus: ProjectStatus.ACTIVE,
  projectMemberRole: ProjectMemberRole.MEMBER,
  areaMemberRole: null,
};

/** 创建消息服务映射所需的最小数据库记录。 */
function createMessageRecord(): ProjectChatMessageRecord {
  const createdAt = new Date('2026-09-04T06:00:00.000Z');

  return {
    id: 100,
    areaId: 40,
    area: { projectId: 10 },
    clientMessageId: '4e6f3b1d-8f2c-4e75-9d49-1d4cc1d1c100',
    type: DiscussionMessageType.TEXT,
    content: '项目级决策的公共讨论依据',
    author: { id: 7, name: '成员甲', avatarUrl: null },
    replyToId: null,
    replyTo: null,
    meetingId: null,
    decision: { id: 20, title: '缓存方案评审' },
    pinnedAt: null,
    editedAt: null,
    deletedAt: null,
    createdAt,
  };
}

/** 创建项目聊天服务及其依赖替身，可控制决策关联校验结果。 */
function createHarness(decision: { id: number } | null) {
  const findIdempotentMessage = jest.fn().mockResolvedValue(null);
  const createMessage = jest.fn().mockResolvedValue(createMessageRecord());
  const findDecision = jest.fn().mockResolvedValue(decision);
  const prisma = {
    discussionMessage: {
      findFirst: findIdempotentMessage,
      create: createMessage,
    },
    decision: { findFirst: findDecision },
    meetingSession: { findFirst: jest.fn() },
  };
  const accessService = {
    findArea: jest.fn().mockResolvedValue(PUBLIC_AREA_CONTEXT),
    assertAreaWritable: jest.fn(),
  };
  const gateway = { broadcastMessageCreated: jest.fn() };

  return {
    service: new ProjectChatService(
      prisma as unknown as PrismaService,
      accessService as unknown as ProjectAccessService,
      {} as ProjectChatTicketService,
      gateway as unknown as ProjectChatGateway,
    ),
    findDecision,
    createMessage,
  };
}

/** 构造一条带项目级决策关联的公共消息请求。 */
function createMessageInput() {
  return {
    clientMessageId: '4e6f3b1d-8f2c-4e75-9d49-1d4cc1d1c100',
    content: '项目级决策的公共讨论依据',
    decisionId: 20,
  };
}

describe('ProjectChatService', () => {
  /** 验证公共消息可以引用项目级决策，且不改变决策自身的范围。 */
  it('公共消息可以关联项目级决策', async () => {
    const { service, findDecision, createMessage } = createHarness({ id: 20 });

    await expect(
      service.create(AUTHORIZATION_CONTEXT, 10, 40, createMessageInput()),
    ).resolves.toMatchObject({
      projectId: 10,
      areaId: 40,
      decision: { id: 20, title: '缓存方案评审' },
    });

    expect(findDecision).toHaveBeenCalledWith({
      where: {
        id: 20,
        projectId: 10,
        OR: [{ areaId: null }, { areaId: 40 }],
      },
      select: { id: true },
    });
    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          areaId: 40,
          decisionId: 20,
        }),
      }),
    );
  });

  /** 验证公共消息不能越过分区边界引用其他私有小组决策。 */
  it('公共消息不能关联其他私有分区决策', async () => {
    const { service, createMessage } = createHarness(null);

    await expect(
      service.create(AUTHORIZATION_CONTEXT, 10, 40, {
        ...createMessageInput(),
        decisionId: 21,
      }),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.DECISION_NOT_FOUND,
      status: 404,
    });
    expect(createMessage).not.toHaveBeenCalled();
  });
});
