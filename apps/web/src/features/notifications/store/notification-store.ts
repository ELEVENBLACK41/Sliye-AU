/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-07-27 17:18:47
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-28 14:54:44
 * @FilePath: \NextNest\apps\web\src\features\notifications\store\notification-store.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件使用 Zustand 管理跨页面共享的实时通知、未读数量和连接状态。
 * 服务端数据库仍是未来消息中心的可信数据源，本 Store 只保存当前浏览器会话状态。
 */
'use client';

import type { RealtimeNotification } from '@workspace/contracts/notifications';
import { create } from 'zustand';

/** 当前浏览器中的全站通知 Socket 连接状态。 */
export type NotificationConnectionStatus = 'unavailable' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** 全站通知客户端 Store。 */
type NotificationStore = {
  /** 当前浏览器会话接收到的最近通知，按时间倒序保存。 */
  notifications: RealtimeNotification[];
  /** 当前浏览器会话中的未读通知数量。 */
  unreadCount: number;
  /** 用户级通知 Socket 当前连接状态。 */
  connectionStatus: NotificationConnectionStatus;
  /** 幂等接收一条实时通知，并返回是否为新通知。 */
  receive: (notification: RealtimeNotification) => boolean;
  /** 更新用户级通知 Socket 连接状态。 */
  setConnectionStatus: (status: NotificationConnectionStatus) => void;
  /** 清空当前浏览器通知状态，退出登录时可直接复用。 */
  reset: () => void;
};

// 限制浏览器端保存的实时通知数量
const MAX_REALTIME_NOTIFICATIONS = 10;

/** 全站通知 Store；仅允许 Client Component 或浏览器事件处理代码使用。 */
export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  connectionStatus: 'disconnected',

  /** 按事件标识去重，避免 Socket 重连或 LiveKit 兜底产生重复提示。 */
  receive(notification): boolean {
    if (get().notifications.some((item) => item.id === notification.id)) {
      return false;
    }
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_REALTIME_NOTIFICATIONS),
      unreadCount: state.unreadCount + 1,
    }));
    return true;
  },

  /** 保存连接状态，供后续消息中心或全局状态标识复用。 */
  setConnectionStatus(connectionStatus): void {
    set({ connectionStatus });
  },

  /** 清除用户相关客户端状态，防止切换账号时串数据。 */
  reset(): void {
    set({
      notifications: [],
      unreadCount: 0,
      connectionStatus: 'disconnected',
    });
  },
}));
