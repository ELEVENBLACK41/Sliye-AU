/**
 * 本文件管理新版项目空间分区聊天的 Socket.IO Ticket、连接生命周期和自动重连。
 */
'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import type { ProjectChatMessage, ProjectChatRealtimeEvents } from '@workspace/contracts/projects';
import { io, type Socket } from 'socket.io-client';

import { getProjectSpaceChatTicket } from '../services/project-space-client.service';

/** 新版项目空间分区聊天可展示的连接状态。 */
export type ProjectSpaceChatConnectionStatus =
  | 'unavailable'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

/** 新版项目空间服务端实时事件的 Socket.IO 监听映射。 */
type ProjectSpaceChatServerEvents = {
  [EventName in keyof ProjectChatRealtimeEvents]: (payload: ProjectChatRealtimeEvents[EventName]) => void;
};

/** 新版项目空间分区实时 Hook 参数。 */
type UseProjectSpaceChatRealtimeOptions = {
  /** 当前项目主键。 */
  projectId: number;
  /** 当前讨论分区主键。 */
  areaId: number;
  /** 收到持久化消息时的合并回调。 */
  onMessage: (message: ProjectChatMessage) => void;
  /** 连接建立后补偿断线消息的回调。 */
  onConnected: () => void | Promise<void>;
  /** 当前分区访问权被撤销时的回调。 */
  onRevoked: () => void;
};

/** 指数退避的最大等待时间。 */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** 读取构建时的实时服务地址。 */
function getRealtimeBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  return value ? value.replace(/\/+$/, '') : null;
}

/** 建立只订阅新版项目空间当前分区的短期 Ticket 连接。 */
export function useProjectSpaceChatRealtime({
  projectId,
  areaId,
  onMessage,
  onConnected,
  onRevoked,
}: UseProjectSpaceChatRealtimeOptions): ProjectSpaceChatConnectionStatus {
  const realtimeBaseUrl = getRealtimeBaseUrl();
  const [status, setStatus] = useState<ProjectSpaceChatConnectionStatus>(realtimeBaseUrl ? 'connecting' : 'unavailable');
  const handleMessage = useEffectEvent(onMessage);
  const handleConnected = useEffectEvent(onConnected);
  const handleRevoked = useEffectEvent(onRevoked);

  /** 在项目或分区切换时建立全新连接并清理旧连接。 */
  useEffect(() => {
    if (!realtimeBaseUrl) return;
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let socket: Socket<Record<string, never>, ProjectSpaceChatServerEvents> | null = null;

    /** 完整销毁当前 Socket。 */
    function disposeSocket(): void {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
    }

    /** 重新获取 Ticket 并按指数退避连接。 */
    function scheduleReconnect(): void {
      if (disposed || timer) return;
      disposeSocket();
      attempts += 1;
      setStatus('reconnecting');
      timer = setTimeout(
        () => {
          timer = null;
          void connect();
        },
        Math.min(1_000 * 2 ** Math.min(attempts - 1, 5), MAX_RECONNECT_DELAY_MS),
      );
    }

    /** 使用最新分区 Ticket 创建 Socket 实例。 */
    async function connect(): Promise<void> {
      if (disposed) return;
      setStatus(attempts === 0 ? 'connecting' : 'reconnecting');
      try {
        const ticket = await getProjectSpaceChatTicket(projectId, areaId);
        if (disposed) return;
        socket = io(`${realtimeBaseUrl}${ticket.namespace}`, {
          auth: { ticket: ticket.ticket },
          autoConnect: false,
          reconnection: false,
          transports: ['websocket'],
        });
        socket.on('project-chat.message.created', handleMessage);
        socket.on('project-chat.access.revoked', () => {
          setStatus('disconnected');
          handleRevoked();
          disposed = true;
          disposeSocket();
        });
        socket.on('connect', () => {
          attempts = 0;
          setStatus('connected');
          void Promise.resolve(handleConnected()).catch(() => undefined);
        });
        socket.on('connect_error', scheduleReconnect);
        socket.on('disconnect', () => {
          if (!disposed) scheduleReconnect();
        });
        socket.connect();
      } catch {
        setStatus('disconnected');
        scheduleReconnect();
      }
    }

    void connect();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      disposeSocket();
    };
  }, [areaId, projectId, realtimeBaseUrl]);

  return status;
}
