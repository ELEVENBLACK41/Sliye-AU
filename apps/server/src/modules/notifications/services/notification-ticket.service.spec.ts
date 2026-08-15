/**
 * 本文件验证全站通知 Socket Ticket 的用户、会话和有效期绑定。
 */
import type { ConfigService } from '@nestjs/config';
import { NotificationTicketService } from './notification-ticket.service';

const SECRET =
  'nextnest-notification-test-secret-with-more-than-thirty-two-characters';

/** 创建通知 Ticket 服务测试所需的配置替身。 */
function createService(): NotificationTicketService {
  const values: Record<string, string | number> = {
    NOTIFICATION_SOCKET_TICKET_SECRET: SECRET,
    NOTIFICATION_SOCKET_TICKET_TTL_SECONDS: 300,
  };
  const configService = {
    get: jest.fn((key: string) => values[key]),
  };
  return new NotificationTicketService(
    configService as unknown as ConfigService,
  );
}

describe('NotificationTicketService', () => {
  it('应签发并验证只绑定当前用户和登录会话的短期 Ticket', () => {
    const service = createService();
    const issued = service.issue({ userId: 7, sessionId: 'session-1' });

    expect(issued.namespace).toBe('/notifications');
    expect(service.verify(issued.ticket)).toMatchObject({
      sub: 7,
      sid: 'session-1',
      type: 'notification',
    });
  });

  it('被篡改的 Ticket 应被拒绝', () => {
    const service = createService();
    const issued = service.issue({ userId: 7, sessionId: 'session-1' });

    expect(() => service.verify(`${issued.ticket}changed`)).toThrow(
      'Invalid notification ticket',
    );
  });
});
