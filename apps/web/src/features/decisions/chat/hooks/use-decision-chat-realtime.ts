/**
 * 本文件管理决策群聊 Socket.IO Ticket 获取、连接生命周期和自动重连。
 */
'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import type { DecisionChatMessage, DecisionChatRealtimeEvents } from '@workspace/contracts/decisions';
import { io, type Socket } from 'socket.io-client';

import { getDecisionChatTicket } from '../services/decision-chat-client.service';

/** 群聊页面可展示的实时连接状态。 */
export type DecisionChatConnectionStatus = 'unavailable' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** Socket.IO 服务端推送事件的客户端监听函数映射。 */
type DecisionChatServerEvents = {
  [EventName in keyof DecisionChatRealtimeEvents]: (payload: DecisionChatRealtimeEvents[EventName]) => void;
};

/** 实时连接 Hook 参数。 */
type UseDecisionChatRealtimeOptions = {
  /** 当前决策主键。 */
  decisionId: number;
  /** 收到已经落库的新消息事件时的合并回调。 */
  onMessage: (message: DecisionChatMessage) => void;
  /** 初次连接或重连成功后执行 HTTP `after` 补偿的回调。 */
  onConnected: () => void | Promise<void>;
};

/** 重连退避的最大等待时间。 */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** 读取构建时公开的 NestJS 实时服务地址并移除尾部斜杠。 */
function getRealtimeBaseUrl(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();

  return configuredUrl ? configuredUrl.replace(/\/+$/, '') : null;
}

/** 管理短期 Ticket 驱动的 Socket.IO 连接；客户端不会通过 Socket 发送消息。 */
export function useDecisionChatRealtime({
  decisionId,
  onMessage,
  onConnected,
}: UseDecisionChatRealtimeOptions): DecisionChatConnectionStatus {
  const realtimeBaseUrl = getRealtimeBaseUrl();
  const [status, setStatus] = useState<DecisionChatConnectionStatus>(realtimeBaseUrl ? 'connecting' : 'unavailable');
  const handleMessage = useEffectEvent(onMessage);
  const handleConnected = useEffectEvent(onConnected);

  /** 获取全新 Ticket 并建立只使用 websocket 传输的 Socket.IO 连接。 */
  useEffect(() => {
    if (!realtimeBaseUrl) {
      return;
    }

    let disposed = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: Socket<Record<string, never>, DecisionChatServerEvents> | null = null;

    /** 清理当前 Socket 实例，防止一次失败触发多个重连分支。 */
    function disposeSocket(): void {
      if (!socket) {
        return;
      }

      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }

    /** 按指数退避安排下一次获取新 Ticket 和重连。 */
    function scheduleReconnect(): void {
      if (disposed || reconnectTimer) {
        return;
      }

      disposeSocket();
      reconnectAttempts += 1;
      const delay = Math.min(1_000 * 2 ** Math.min(reconnectAttempts - 1, 5), MAX_RECONNECT_DELAY_MS);

      setStatus('reconnecting');
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    }

    /** 获取当前决策专用 Ticket，并为本轮连接注册广播与重连监听。 */
    async function connect(): Promise<void> {
      if (disposed) {
        return;
      }

      setStatus(reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

      try {
        const ticket = await getDecisionChatTicket(decisionId);

        if (disposed) {
          return;
        }

        socket = io(`${realtimeBaseUrl}${ticket.namespace}`, {
          auth: { ticket: ticket.ticket },
          autoConnect: false,
          reconnection: false,
          transports: ['websocket'],
        });
        socket.on('decision-chat.message.created', (message) => {
          handleMessage(message);
        });
        socket.on('connect', () => {
          reconnectAttempts = 0;
          setStatus('connected');
          void Promise.resolve(handleConnected()).catch(() => undefined);
        });
        socket.on('connect_error', () => {
          setStatus('disconnected');
          scheduleReconnect();
        });
        socket.on('disconnect', () => {
          if (!disposed) {
            setStatus('disconnected');
            scheduleReconnect();
          }
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

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      disposeSocket();
    };
  }, [decisionId, realtimeBaseUrl]);

  return status;
}
