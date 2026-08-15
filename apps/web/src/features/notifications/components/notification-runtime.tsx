/**
 * 本文件在全站根布局维持用户级通知 Socket，并把实时事件交给全局通知 Store 与 Sonner。
 */
'use client';

import { useEffect } from 'react';
import type { NotificationRealtimeEvents } from '@workspace/contracts/notifications';
import { io, type Socket } from 'socket.io-client';

import { AUTH_SESSION_CHANGED_EVENT } from '../constants';
import { getNotificationSocketTicket } from '../services/notifications-client.service';
import { presentNotification } from '../services/present-notification';
import { useNotificationStore } from '../store/notification-store';
import { ApiClientError } from '@/services/request';
import { IncomingCallRuntime } from './incoming-call-runtime';

/** 服务端向浏览器发送的强类型通知事件映射。 */
type NotificationServerEvents = {
  [EventName in keyof NotificationRealtimeEvents]: (payload: NotificationRealtimeEvents[EventName]) => void;
};

const MAX_RECONNECT_DELAY_MS = 30_000;

/** 全站通知运行时属性。 */
type NotificationRuntimeProps = {
  /** 当前登录用户主键，用于隔离同浏览器内不同账号的跨标签来电响应。 */
  currentUserId: number | null;
};

/** 读取构建时配置的 NestJS Socket.IO 服务地址。 */
function getRealtimeBaseUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  return value ? value.replace(/\/+$/, '') : null;
}

/** 建立全站唯一的当前用户通知连接；未登录时安静等待后续重试。 */
export function NotificationRuntime({ currentUserId }: NotificationRuntimeProps) {
  useEffect(() => {
    const realtimeBaseUrl = getRealtimeBaseUrl();
    if (!realtimeBaseUrl) {
      useNotificationStore.getState().setConnectionStatus('unavailable');
      return;
    }

    let disposed = false;
    let attempts = 0;
    let connectionGeneration = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let socket: Socket<Record<string, never>, NotificationServerEvents> | null = null;

    /** 完整释放当前 Socket 和所有事件监听器。 */
    function disposeSocket(): void {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
    }

    /** 在未登录、Ticket 到期或网络异常后按指数退避重新连接。 */
    function scheduleReconnect(): void {
      if (disposed || timer) return;
      disposeSocket();
      attempts += 1;
      useNotificationStore.getState().setConnectionStatus('reconnecting');
      timer = setTimeout(
        () => {
          timer = null;
          void connect();
        },
        Math.min(1_000 * 2 ** Math.min(attempts - 1, 5), MAX_RECONNECT_DELAY_MS),
      );
    }

    /** 获取最新短期 Ticket 并创建用户级通知连接。 */
    async function connect(): Promise<void> {
      if (disposed) return;
      const currentGeneration = ++connectionGeneration;
      useNotificationStore.getState().setConnectionStatus(attempts === 0 ? 'connecting' : 'reconnecting');
      try {
        const ticket = await getNotificationSocketTicket();
        if (disposed || currentGeneration !== connectionGeneration) return;
        socket = io(`${realtimeBaseUrl}${ticket.namespace}`, {
          auth: { ticket: ticket.ticket },
          autoConnect: false,
          reconnection: false,
          transports: ['websocket'],
        });
        socket.on('notification.created', presentNotification);
        socket.on('connect', () => {
          attempts = 0;
          useNotificationStore.getState().setConnectionStatus('connected');
        });
        socket.on('connect_error', scheduleReconnect);
        socket.on('disconnect', () => {
          if (!disposed) scheduleReconnect();
        });
        socket.connect();
      } catch (error) {
        if (disposed || currentGeneration !== connectionGeneration) return;
        useNotificationStore.getState().setConnectionStatus('disconnected');
        if (error instanceof ApiClientError && error.status === 401) {
          return;
        }
        scheduleReconnect();
      }
    }

    /** 浏览器恢复联网时立即重新尝试，而不是继续等待退避窗口。 */
    function handleOnline(): void {
      if (socket?.connected || disposed) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      void connect();
    }

    /** 登录或退出成功时立即清理旧用户状态并重新判断当前会话。 */
    function handleAuthSessionChanged(): void {
      disposeSocket();
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      attempts = 0;
      useNotificationStore.getState().reset();
      void connect();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleAuthSessionChanged);
    void connect();
    return () => {
      disposed = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleAuthSessionChanged);
      if (timer) clearTimeout(timer);
      disposeSocket();
      useNotificationStore.getState().reset();
    };
  }, []);

  return <IncomingCallRuntime currentUserId={currentUserId} />;
}
