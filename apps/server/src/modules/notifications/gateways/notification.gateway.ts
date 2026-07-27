/**
 * 本文件维护全站用户级通知 Socket.IO 连接并向私人频道广播业务通知。
 */
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type {
  NotificationRealtimeEvents,
  RealtimeNotification,
} from '@workspace/contracts/notifications';
import type { Namespace, Socket } from 'socket.io';
import { NotificationAccessService } from '../services/notification-access.service';
import { NotificationTicketService } from '../services/notification-ticket.service';
import type { NotificationTicketPayload } from '../types/notification-ticket.types';

/** 服务端向浏览器发送的强类型通知事件映射。 */
type NotificationServerEvents = {
  [EventName in keyof NotificationRealtimeEvents]: (
    payload: NotificationRealtimeEvents[EventName],
  ) => void;
};

/** 完成鉴权后保存在单个通知 Socket 上的数据。 */
type NotificationSocketData = {
  /** 已验签的当前用户 Ticket 载荷。 */
  ticket: NotificationTicketPayload;
  /** Ticket 到期时主动断开连接的定时器。 */
  expiryTimer?: ReturnType<typeof setTimeout>;
};

/** 全站通知命名空间中的服务端 Socket 类型。 */
type NotificationSocket = Socket<
  Record<string, never>,
  NotificationServerEvents,
  Record<string, never>,
  NotificationSocketData
>;

@WebSocketGateway({ namespace: '/notifications' })
export class NotificationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  /** 当前 Gateway 对应的 Socket.IO 命名空间。 */
  @WebSocketServer()
  private namespace?: Namespace<
    Record<string, never>,
    NotificationServerEvents,
    Record<string, never>,
    NotificationSocketData
  >;

  /** 注入 Ticket 验签和会话实时校验服务。 */
  constructor(
    private readonly ticketService: NotificationTicketService,
    private readonly accessService: NotificationAccessService,
  ) {}

  /** 在握手阶段验证 Ticket 和当前登录会话。 */
  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      void this.authenticateSocket(socket as NotificationSocket)
        .then(() => next())
        .catch(() =>
          next(new Error('Notification ticket is invalid or expired')),
        );
    });
  }

  /** 将通过鉴权的连接加入只能由服务端确定的用户私人频道。 */
  handleConnection(@ConnectedSocket() client: NotificationSocket): void {
    const payload = client.data.ticket;
    void client.join(this.createUserRoom(payload.sub));
    client.data.expiryTimer = setTimeout(
      () => client.disconnect(true),
      Math.max(0, payload.exp * 1000 - Date.now()),
    );
  }

  /** 连接断开时清理 Ticket 到期定时器。 */
  handleDisconnect(@ConnectedSocket() client: NotificationSocket): void {
    if (client.data.expiryTimer) {
      clearTimeout(client.data.expiryTimer);
    }
  }

  /** 向指定用户当前在线的全部浏览器和设备广播一条通知。 */
  broadcastToUser(userId: number, notification: RealtimeNotification): void {
    this.namespace
      ?.to(this.createUserRoom(userId))
      .emit('notification.created', notification);
  }

  /** 验证单个 Socket 的签名凭证和当前数据库会话。 */
  private async authenticateSocket(client: NotificationSocket): Promise<void> {
    const authentication = client.handshake.auth as unknown as Record<
      string,
      unknown
    >;
    const rawTicket = authentication.ticket;
    if (typeof rawTicket !== 'string' || rawTicket.length === 0) {
      throw new Error('Notification ticket is required');
    }

    const payload = this.ticketService.verify(rawTicket);
    const allowed = await this.accessService.validateSession(
      payload.sub,
      payload.sid,
    );
    if (!allowed) {
      throw new Error('Notification session is no longer active');
    }
    client.data.ticket = payload;
  }

  /** 创建不会与其他 Socket 业务冲突的稳定用户私人频道名。 */
  private createUserRoom(userId: number): string {
    return `user:${userId}`;
  }
}
