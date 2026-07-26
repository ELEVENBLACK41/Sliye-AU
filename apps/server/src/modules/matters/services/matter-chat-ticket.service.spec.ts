/**
 * 本文件验证议事分区 Socket Ticket 的范围绑定、签名与过期边界。
 */
import type { ConfigService } from '@nestjs/config';
import { MatterChatTicketService } from './matter-chat-ticket.service';

/** 创建使用固定密钥和有效期的 Ticket 服务。 */
function createService(ttlSeconds = 300): MatterChatTicketService {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'CHAT_SOCKET_TICKET_SECRET') {
        return 'matter-chat-ticket-test-secret-at-least-32-chars';
      }
      if (key === 'CHAT_SOCKET_TICKET_TTL_SECONDS') {
        return ttlSeconds;
      }
      return undefined;
    }),
  } as unknown as ConfigService;

  return new MatterChatTicketService(configService);
}

describe('MatterChatTicketService', () => {
  it('应签发绑定用户、会话、议事和分区的短期凭证', () => {
    const service = createService();
    const issued = service.issue({
      userId: 7,
      sessionId: 'session-1',
      matterId: 10,
      areaId: 40,
    });

    expect(issued.namespace).toBe('/matter-chat');
    expect(service.verify(issued.ticket)).toMatchObject({
      sub: 7,
      sid: 'session-1',
      matterId: 10,
      areaId: 40,
      type: 'matter-chat',
    });
  });

  it('凭证内容被篡改后应拒绝验证', () => {
    const service = createService();
    const issued = service.issue({
      userId: 7,
      sessionId: 'session-1',
      matterId: 10,
      areaId: 40,
    });
    const parts = issued.ticket.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ sub: 8, type: 'matter-chat' }),
    ).toString('base64url');

    expect(() => service.verify(parts.join('.'))).toThrow(
      'Invalid matter chat ticket',
    );
  });

  it('超过有效期后应拒绝连接', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-26T00:00:00.000Z'));
    const service = createService(1);
    const issued = service.issue({
      userId: 7,
      sessionId: 'session-1',
      matterId: 10,
      areaId: 40,
    });
    jest.advanceTimersByTime(1000);

    expect(() => service.verify(issued.ticket)).toThrow(
      'Matter chat ticket expired',
    );
    jest.useRealTimers();
  });
});
