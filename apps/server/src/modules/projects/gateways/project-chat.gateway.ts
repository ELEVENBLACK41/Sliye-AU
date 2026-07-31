/**
 * 本文件提供项目分区隔离的只读广播 Socket.IO Gateway，并在授权撤销时主动断开连接。
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
  ProjectChatMessage,
  ProjectChatRealtimeEvents,
} from '@workspace/contracts/projects';
import type { Namespace, Socket } from 'socket.io';
import { ProjectAccessService } from '../services/project-access.service';
import { ProjectChatTicketService } from '../services/project-chat-ticket.service';
import type { ProjectChatTicketPayload } from '../types/project-chat-ticket.types';

/** Socket.IO 服务端向浏览器发送的强类型事件函数映射。 */
type ProjectChatServerEvents = {
  [EventName in keyof ProjectChatRealtimeEvents]: (
    payload: ProjectChatRealtimeEvents[EventName],
  ) => void;
};

/** 通过 Ticket 鉴权后保存在单个 Socket 上的数据。 */
type ProjectChatSocketData = {
  /** 已验证的短期 Ticket 载荷。 */
  ticket: ProjectChatTicketPayload;
  /** Ticket 到期时主动断开的定时器。 */
  expiryTimer?: ReturnType<typeof setTimeout>;
};

/** 项目分区聊天命名空间中的服务端 Socket 类型。 */
type ProjectChatSocket = Socket<
  Record<string, never>,
  ProjectChatServerEvents,
  Record<string, never>,
  ProjectChatSocketData
>;

@WebSocketGateway({ namespace: '/project-chat' })
export class ProjectChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  /** 当前 Gateway 对应的 Socket.IO 命名空间。 */
  @WebSocketServer()
  private namespace?: Namespace<
    Record<string, never>,
    ProjectChatServerEvents,
    Record<string, never>,
    ProjectChatSocketData
  >;

  /** 注入 Ticket 验证和分区实时授权服务。 */
  constructor(
    private readonly ticketService: ProjectChatTicketService,
    private readonly accessService: ProjectAccessService,
  ) {}

  /** 在握手阶段校验 Ticket、登录会话和当前分区成员关系。 */
  afterInit(namespace: Namespace): void {
    namespace.use((socket, next) => {
      void this.authenticateSocket(socket as ProjectChatSocket)
        .then(() => next())
        .catch(() =>
          next(new Error('Project chat ticket is invalid or expired')),
        );
    });
  }

  /** 将已鉴权连接加入唯一绑定的项目分区房间。 */
  handleConnection(@ConnectedSocket() client: ProjectChatSocket): void {
    const payload = client.data.ticket;
    void client.join(this.createAreaRoom(payload.projectId, payload.areaId));
    client.data.expiryTimer = setTimeout(
      () => client.disconnect(true),
      Math.max(0, payload.exp * 1000 - Date.now()),
    );
  }

  /** 连接断开时清理 Ticket 到期定时器。 */
  handleDisconnect(@ConnectedSocket() client: ProjectChatSocket): void {
    if (client.data.expiryTimer) {
      clearTimeout(client.data.expiryTimer);
    }
  }

  /** 广播已经成功落库的分区消息。 */
  broadcastMessageCreated(
    projectId: number,
    areaId: number,
    message: ProjectChatMessage,
  ): void {
    this.namespace
      ?.to(this.createAreaRoom(projectId, areaId))
      .emit('project-chat.message.created', message);
  }

  /** 断开某用户在一项项目中的全部分区连接。 */
  disconnectUserFromProject(projectId: number, userId: number): void {
    this.disconnectMatchingSockets(
      (payload) => payload.projectId === projectId && payload.sub === userId,
    );
  }

  /** 断开某用户在指定私有分区中的连接。 */
  disconnectUserFromArea(
    projectId: number,
    areaId: number,
    userId: number,
  ): void {
    this.disconnectMatchingSockets(
      (payload) =>
        payload.projectId === projectId &&
        payload.areaId === areaId &&
        payload.sub === userId,
    );
  }

  /** 校验单个 Socket 的签名凭证和数据库实时授权。 */
  private async authenticateSocket(client: ProjectChatSocket): Promise<void> {
    const authentication = client.handshake.auth as unknown as Record<
      string,
      unknown
    >;
    const rawTicket = authentication.ticket;
    if (typeof rawTicket !== 'string' || rawTicket.length === 0) {
      throw new Error('Project chat ticket is required');
    }

    const payload = this.ticketService.verify(rawTicket);
    const allowed = await this.accessService.validateRealtimeAccess(
      payload.sub,
      payload.sid,
      payload.projectId,
      payload.areaId,
    );
    if (!allowed) {
      throw new Error('Project chat access revoked');
    }

    client.data.ticket = payload;
  }

  /** 向匹配连接发送撤销事件后强制断开。 */
  private disconnectMatchingSockets(
    predicate: (payload: ProjectChatTicketPayload) => boolean,
  ): void {
    if (!this.namespace) {
      return;
    }

    for (const socket of this.namespace.sockets.values()) {
      const client = socket;
      const payload = client.data.ticket;
      if (!payload || !predicate(payload)) {
        continue;
      }

      client.emit('project-chat.access.revoked', {
        projectId: payload.projectId,
        areaId: payload.areaId,
      });
      client.disconnect(true);
    }
  }

  /** 创建不会与其他业务冲突的稳定分区房间名。 */
  private createAreaRoom(projectId: number, areaId: number): string {
    return `project:${projectId}:area:${areaId}`;
  }
}
