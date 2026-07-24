/**
 * 本文件定义无音视频会议生命周期及参会成员的前后端共享契约。
 */

/** 会议从计划到结束的稳定业务状态。 */
export type MeetingStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'CANCELLED';

/** 用户在单场会议中承担的业务角色。 */
export type MeetingParticipantRole = 'HOST' | 'CO_HOST' | 'ATTENDEE';

/** 会议页面和成员列表使用的最小用户摘要。 */
export type MeetingUserSummary = {
  /** 用户数据库主键。 */
  id: number;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
};

/** 一场会议中的受邀成员及其业务角色。 */
export type MeetingParticipant = {
  /** 会议参与关系数据库主键。 */
  id: number;
  /** 所属会议数据库主键。 */
  meetingId: number;
  /** 参与者在当前会议中的角色。 */
  role: MeetingParticipantRole;
  /** 参与者用户摘要。 */
  user: MeetingUserSummary;
  /** 首次实际加入会议的时间；尚未接入实时服务或未加入时为 `null`。 */
  joinedAt: string | null;
  /** 最近一次实际离开会议的时间；尚未离开时为 `null`。 */
  leftAt: string | null;
  /** 参与关系创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
};

/** 会议列表和房间头部使用的会议摘要。 */
export type MeetingSummary = {
  /** 会议数据库主键。 */
  id: number;
  /** 会议所属决策数据库主键。 */
  decisionId: number;
  /** 会议标题。 */
  title: string;
  /** 会议背景或目标说明。 */
  description: string | null;
  /** 会议当前业务状态。 */
  status: MeetingStatus;
  /** 创建会议的用户摘要。 */
  createdBy: MeetingUserSummary;
  /** 当前会议的受邀成员数量。 */
  participantCount: number;
  /** 计划开始时间；未安排明确时间时为 `null`。 */
  scheduledAt: string | null;
  /** 实际开始时间；会议尚未开始时为 `null`。 */
  startedAt: string | null;
  /** 实际结束时间；会议尚未结束时为 `null`。 */
  endedAt: string | null;
  /** 会议记录创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 会议记录最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 会议详情，包含完整受邀成员列表。 */
export type MeetingDetail = MeetingSummary & {
  /** 当前会议的全部受邀成员。 */
  participants: MeetingParticipant[];
};

/** 在一项决策中创建会议的请求体。 */
export type CreateMeetingRequestPayload = {
  /** 会议标题。 */
  title: string;
  /** 会议背景、目标或补充说明。 */
  description?: string;
  /** 计划开始时间，使用 ISO 8601 字符串。 */
  scheduledAt?: string;
};

/** 指定决策下的会议列表接口返回数据。 */
export type MeetingListResponse = MeetingSummary[];
