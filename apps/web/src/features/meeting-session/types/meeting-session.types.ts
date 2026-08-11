/**
 * 本文件定义新版会议全局会话、悬浮小窗和多标签协调使用的客户端类型。
 */
import type { MeetingDetail, MeetingMediaMode } from '@workspace/contracts/meetings';

/** 新版会议客户端从空闲到退出的稳定连接状态。 */
export type MeetingSessionStatus =
  | 'IDLE'
  | 'ACQUIRING_TAB'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'OWNED_BY_OTHER_TAB'
  | 'ENDING'
  | 'ENDED'
  | 'ERROR';

/** 会议媒体当前使用全屏房间还是应用内悬浮小窗展示。 */
export type MeetingPresentationMode = 'FULL' | 'MINI';

/** 可以安全写入 Zustand 和跨标签通道的会议会话快照。 */
export type SerializableMeetingSession = {
  /** 当前会议主键。 */
  meetingId: number | null;
  /** 当前会议标题。 */
  title: string | null;
  /** 当前会议所属分区名称；独立会议为 `null`。 */
  areaName: string | null;
  /** 当前会议媒体模式。 */
  mediaMode: MeetingMediaMode | null;
  /** 当前会议连接状态。 */
  status: MeetingSessionStatus;
  /** 当前会议参与人数。 */
  participantCount: number;
  /** 当前用户是否可以结束整场会议。 */
  canEndMeeting: boolean;
  /** 持有媒体连接的浏览器标签标识。 */
  ownerTabId: string | null;
};

/** 打开新版会议全局会话所需的服务端可信输入。 */
export type OpenMeetingSessionInput = {
  /** 服务端已经完成可见性校验的会议详情。 */
  meeting: MeetingDetail;
  /** 当前登录用户主键。 */
  currentUserId: number;
};

/** 全局会议运行时发送给界面的轻量反馈事件。 */
export type MeetingSessionFeedback = {
  /** 反馈类型决定提示样式和路由处理。 */
  type: 'notice' | 'error' | 'ended';
  /** 面向用户的中文反馈。 */
  message: string;
};
