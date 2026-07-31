/**
 * 本文件管理项目分区 Socket.IO Ticket、连接生命周期和自动重连。
 */
'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import type { ProjectChatMessage, ProjectChatRealtimeEvents } from '@workspace/contracts/projects';
import { io, type Socket } from 'socket.io-client';

import { getProjectChatTicket } from '../../services/projects-client.service';

/** 分区聊天可展示的连接状态。 */
export type ProjectChatConnectionStatus = 'unavailable' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** 服务端实时事件的 Socket.IO 监听映射。 */
type ProjectChatServerEvents = {
  [EventName in keyof ProjectChatRealtimeEvents]: (payload: ProjectChatRealtimeEvents[EventName]) => void;
};

/** 分区实时 Hook 参数。 */
type UseProjectChatRealtimeOptions = {
  projectId: number;
  areaId: number;
  onMessage: (message: ProjectChatMessage) => void;
  onConnected: () => void | Promise<void>;
  onRevoked: () => void;
};

/** 指数退避的最大等待时间。 */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** 读取构建时的实时服务地址。 */
function getRealtimeBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  return value ? value.replace(/\/+$/, '') : null;
}

/** 建立只订阅当前项目分区的短期 Ticket 连接。 */
export function useProjectChatRealtime({
  projectId,
  areaId,
  onMessage,
  onConnected,
  onRevoked,
}: UseProjectChatRealtimeOptions): ProjectChatConnectionStatus {
  const realtimeBaseUrl = getRealtimeBaseUrl();
  const [status, setStatus] = useState<ProjectChatConnectionStatus>(realtimeBaseUrl ? 'connecting' : 'unavailable');
  const handleMessage = useEffectEvent(onMessage);
  const handleConnected = useEffectEvent(onConnected);
  const handleRevoked = useEffectEvent(onRevoked);

  /** 在项目或分区切换时建立全新连接并清理旧连接。 */
  useEffect(() => {
    if (!realtimeBaseUrl) return;
    let disposed = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let socket: Socket<Record<string, never>, ProjectChatServerEvents> | null = null;

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
        const ticket = await getProjectChatTicket(projectId, areaId);
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
