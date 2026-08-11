/**
 * 本文件为新版会议页面和悬浮小窗提供统一的全局会话读取入口。
 */
'use client';

import { meetingSessionController } from '../services/meeting-session-controller';
import { useMeetingSessionStore } from '../store/meeting-session-store';

/** 读取可序列化会议状态，并在轨道变化时返回 Controller 中的最新参与人。 */
export function useMeetingSession() {
  const state = useMeetingSessionStore();
  // roomRevision 虽不直接展示，但必须被订阅以触发参与人与 Track 重新读取。
  void state.roomRevision;
  return {
    ...state,
    participants: meetingSessionController.getParticipants(),
    controller: meetingSessionController,
  };
}
