/**
 * 本文件验证项目分区 Socket Ticket 的范围绑定、签名与过期边界。
 */
import type { ConfigService } from '@nestjs/config';
import { ProjectChatTicketService } from './project-chat-ticket.service';

/** 创建使用固定密钥和有效期的 Ticket 服务。 */
function createService(ttlSeconds = 300): ProjectChatTicketService {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'CHAT_SOCKET_TICKET_SECRET') {
        return 'project-chat-ticket-test-secret-at-least-32-chars';
      }
      if (key === 'CHAT_SOCKET_TICKET_TTL_SECONDS') {
        return ttlSeconds;
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  return new ProjectChatTicketService(configService);
}

describe('ProjectChatTicketService', () => {
  it('应签发绑定用户、会话、项目和分区的短期凭证', () => {
    const service = createService();
    const issued = service.issue({
      userId: 7,
      sessionId: 'session-1',
      projectId: 10,
      areaId: 40,
    });

    expect(issued.namespace).toBe('/project-chat');
    expect(service.verify(issued.ticket)).toMatchObject({
      sub: 7,
      sid: 'session-1',
      projectId: 10,
      areaId: 40,
      type: 'project-chat',
    });
  });

  it('凭证内容被篡改后应拒绝验证', () => {
    const service = createService();
    const issued = service.issue({
      userId: 7,
      sessionId: 'session-1',
      projectId: 10,
      areaId: 40,
    });
    const parts = issued.ticket.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ sub: 8, type: 'project-chat' }),
    ).toString('base64url');

    expect(() => service.verify(parts.join('.'))).toThrow(
      'Invalid project chat ticket',
    );
  });

  it('超过有效期后应拒绝连接', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-26T00:00:00.000Z'));
    const service = createService(1);
    const issued = service.issue({
      userId: 7,
      sessionId: 'session-1',
      projectId: 10,
      areaId: 40,
    });
    jest.advanceTimersByTime(1000);

    expect(() => service.verify(issued.ticket)).toThrow(
      'Project chat ticket expired',
    );
    jest.useRealTimers();
  });
});
