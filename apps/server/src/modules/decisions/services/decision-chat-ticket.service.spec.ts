/**
 * 本文件验证决策群聊短期 Socket Ticket 的签发、绑定范围、篡改和过期边界。
 */
import { ConfigService } from '@nestjs/config';
import { DecisionChatTicketService } from './decision-chat-ticket.service';

/** 使用指定 Ticket 有效期创建测试服务。 */
function createService(ttlSeconds = 300): DecisionChatTicketService {
  return new DecisionChatTicketService(
    new ConfigService({
      CHAT_SOCKET_TICKET_SECRET:
        'test-decision-chat-ticket-secret-at-least-32-characters',
      CHAT_SOCKET_TICKET_TTL_SECONDS: ttlSeconds,
    }),
  );
}

describe('DecisionChatTicketService', () => {
  it('签发的 Ticket 应绑定用户、会话和唯一决策', () => {
    const service = createService();
    const result = service.issue({
      userId: 7,
      sessionId: 'session-1',
      decisionId: 20,
    });

    expect(service.verify(result.ticket)).toMatchObject({
      sub: 7,
      sid: 'session-1',
      decisionId: 20,
      type: 'decision-chat',
    });
    expect(result.namespace).toBe('/decision-chat');
  });

  it('Ticket 任意字符被篡改后应拒绝验证', () => {
    const service = createService();
    const result = service.issue({
      userId: 7,
      sessionId: 'session-1',
      decisionId: 20,
    });
    const tamperedTicket = `${result.ticket.slice(0, -1)}x`;

    expect(() => service.verify(tamperedTicket)).toThrow(
      'Invalid decision chat ticket',
    );
  });

  it('超过有效期的 Ticket 应拒绝验证', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
    const service = createService(1);
    const result = service.issue({
      userId: 7,
      sessionId: 'session-1',
      decisionId: 20,
    });

    jest.setSystemTime(new Date('2026-07-22T10:00:02.000Z'));
    expect(() => service.verify(result.ticket)).toThrow(
      'Decision chat ticket expired',
    );
    jest.useRealTimers();
  });
});
