/**
 * 本文件使用 Zustand 保存新版会议跨路由共享的可序列化状态。
 */
'use client';

import { create } from 'zustand';

import type {
  MeetingPresentationMode,
  MeetingSessionStatus,
  SerializableMeetingSession,
} from '../types/meeting-session.types';

/** 新版会议全局 Store 状态。 */
export type MeetingSessionStoreState = SerializableMeetingSession & {
  /** 当前登录用户主键；用于隔离多标签协调通道。 */
  currentUserId: number | null;
  /** 当前标签页的会话级稳定标识。 */
  currentTabId: string | null;
  /** 当前媒体展示模式。 */
  presentationMode: MeetingPresentationMode;
  /** 悬浮小窗是否已收起为紧凑状态条。 */
  miniCollapsed: boolean;
  /** 当前麦克风是否启用。 */
  microphoneEnabled: boolean;
  /** 当前摄像头是否启用。 */
  cameraEnabled: boolean;
  /** 当前屏幕共享是否启用。 */
  screenShareEnabled: boolean;
  /** 浏览器自动播放策略是否阻止了远端音频。 */
  audioBlocked: boolean;
  /** 媒体设备的非阻断提示。 */
  deviceWarning: string | null;
  /** 当前连接错误。 */
  connectionError: string | null;
  /** 媒体参与人或轨道变化版本，用于触发视图读取 Controller。 */
  roomRevision: number;
};

/** 新版会议全局 Store 操作。 */
type MeetingSessionStoreActions = {
  /** 合并一组会话状态。 */
  patch: (patch: Partial<MeetingSessionStoreState>) => void;
  /** 将媒体参与人或轨道版本递增。 */
  bumpRoomRevision: () => void;
  /** 清理当前用户的全部会议客户端状态。 */
  reset: () => void;
};

/** 创建空闲会议状态，确保退出和登录用户切换时使用同一套默认值。 */
function createInitialState(): MeetingSessionStoreState {
  return {
    meetingId: null,
    title: null,
    areaName: null,
    mediaMode: null,
    status: 'IDLE',
    participantCount: 0,
    canEndMeeting: false,
    ownerTabId: null,
    currentUserId: null,
    currentTabId: null,
    presentationMode: 'FULL',
    miniCollapsed: false,
    microphoneEnabled: false,
    cameraEnabled: false,
    screenShareEnabled: false,
    audioBlocked: false,
    deviceWarning: null,
    connectionError: null,
    roomRevision: 0,
  };
}

/** 新版会议全局 Store；媒体对象和凭证禁止写入此处。 */
export const useMeetingSessionStore = create<MeetingSessionStoreState & MeetingSessionStoreActions>((set) => ({
  ...createInitialState(),

  /** 合并 Controller 或跨标签协调器返回的可序列化状态。 */
  patch(patch): void {
    set(patch);
  },

  /** 在 LiveKit 参与人或轨道变化时通知媒体视图重新读取 Controller。 */
  bumpRoomRevision(): void {
    set((state) => ({ roomRevision: state.roomRevision + 1 }));
  },

  /** 清理会议数据但保留 Store 操作函数。 */
  reset(): void {
    set(createInitialState());
  },
}));

/** 判断当前 Store 状态是否仍代表一场未退出的会议。 */
export function hasActiveMeetingSession(status: MeetingSessionStatus): boolean {
  return status !== 'IDLE' && status !== 'ENDED';
}
