/**
 * 本文件提供决策群聊只接收服务端广播的 Socket.IO Gateway，不接收客户端写消息。
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
  DecisionChatMessage,
  DecisionChatRealtimeEvents,
} from '@workspace/contracts/decisions';
import type { Namespace, Socket } from 'socket.io';
import { DecisionChatTicketService } from '../services/decision-chat-ticket.service';
import type { DecisionChatTicketPayload } from '../types/decision-chat-ticket.types';

/** Socket.IO 服务端向浏览器发送的强类型事件函数映射。 */
type DecisionChatServerEvents = {
  [EventName in keyof DecisionChatRealtimeEvents]: (
    payload: DecisionChatRealtimeEvents[EventName],
  ) => void;
};

/** 通过 Ticket 鉴权后保存在单个 Socket 连接上的可信数据。 */
type DecisionChatSocketData = {
  /** 已验证的短期 Ticket 载荷。 */
  ticket: DecisionChatTicketPayload;
  /** Ticket 到期时主动断开连接的定时器。 */
  expiryTimer?: ReturnType<typeof setTimeout>;
};

/** 决策群聊命名空间中的服务端 Socket 类型。 */
type DecisionChatSocket = Socket<
  Record<string, never>,
  DecisionChatServerEvents,
  Record<string, never>,
  DecisionChatSocketData
>;

@WebSocketGateway({ namespace: '/decision-chat' })
export class DecisionChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  /** 当前 Gateway 对应的 Socket.IO 命名空间。 */
  @WebSocketServer()
  private namespace!: Namespace<
    Record<string, never>,
    DecisionChatServerEvents,
    Record<string, never>,
    DecisionChatSocketData
  >;

  /** 注入 Ticket 签名验证服务。 */
  constructor(private readonly ticketService: DecisionChatTicketService) {}

  /** 在 Socket.IO 握手阶段验证 Ticket，失败时拒绝建立连接。 */
  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      try {
        const authentication = socket.handshake.auth as unknown as Record<
          string,
          unknown
        >;
        const rawTicket = authentication.ticket;

        if (typeof rawTicket !== 'string' || rawTicket.length === 0) {
          next(new Error('Decision chat ticket is required'));
          return;
        }

        (socket.data as DecisionChatSocketData).ticket =
          this.ticketService.verify(rawTicket);
        next();
      } catch {
        next(new Error('Decision chat ticket is invalid or expired'));
      }
    });
  }

  /** 将已鉴权连接加入 Ticket 唯一绑定的决策房间，并在 Ticket 到期时主动断开。 */
  handleConnection(@ConnectedSocket() client: DecisionChatSocket): void {
    const payload = client.data.ticket;

    void client.join(this.createDecisionRoom(payload.decisionId));
    client.data.expiryTimer = setTimeout(
      () => client.disconnect(true),
      Math.max(0, payload.exp * 1000 - Date.now()),
    );
  }

  /** 连接断开时清理 Ticket 到期定时器。 */
  handleDisconnect(@ConnectedSocket() client: DecisionChatSocket): void {
    if (client.data.expiryTimer) {
      clearTimeout(client.data.expiryTimer);
    }
  }

  /** 把已经成功落库的消息广播给当前决策房间内的全部在线查看者。 */
  broadcastMessageCreated(
    decisionId: number,
    message: DecisionChatMessage,
  ): void {
    this.namespace
      .to(this.createDecisionRoom(decisionId))
      .emit('decision-chat.message.created', message);
  }

  /** 创建不会与其他实时业务冲突的稳定决策房间名。 */
  private createDecisionRoom(decisionId: number): string {
    return `decision:${decisionId}`;
  }
}
