/**
 * 本文件定义项目分区会议、参与者和多决策关联的前后端共享契约。
 */

import type { DiscussionAreaType } from '../projects/project.types.ts';

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

/** 会议关联的一项决策摘要。 */
export type MeetingDecisionSummary = {
  /** 决策数据库主键。 */
  id: number;
  /** 决策标题。 */
  title: string;
  /** 决策当前状态。 */
  status: 'DRAFT' | 'DISCUSSING' | 'RESOLVED' | 'CANCELLED' | 'ARCHIVED';
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
  /** 首次实际加入会议的时间。 */
  joinedAt: string | null;
  /** 最近一次实际离开会议的时间。 */
  leftAt: string | null;
  /** 参与关系创建时间。 */
  createdAt: string;
};

/** 会议列表和房间头部使用的会议摘要。 */
export type MeetingSummary = {
  /** 会议数据库主键。 */
  id: number;
  /** 会议所属项目主键。 */
  projectId: number;
  /** 会议所属讨论分区主键。 */
  areaId: number;
  /** 会议可见范围。 */
  areaType: DiscussionAreaType;
  /** 会议所属分区名称。 */
  areaName: string;
  /** 会议标题。 */
  title: string;
  /** 会议背景或目标说明。 */
  description: string | null;
  /** 会议当前业务状态。 */
  status: MeetingStatus;
  /** 创建会议的用户摘要。 */
  createdBy: MeetingUserSummary;
  /** 当前会议受邀成员数量。 */
  participantCount: number;
  /** 会议关联的零到多项决策。 */
  decisions: MeetingDecisionSummary[];
  /** 计划开始时间。 */
  scheduledAt: string | null;
  /** 计划持续分钟数；历史会议未设置时为 `null`。 */
  scheduledDurationMinutes: number | null;
  /** 实际开始时间。 */
  startedAt: string | null;
  /** 实际结束时间。 */
  endedAt: string | null;
  /** 会议记录创建时间。 */
  createdAt: string;
  /** 会议记录最后更新时间。 */
  updatedAt: string;
};

/** 会议详情，包含完整受邀成员列表。 */
export type MeetingDetail = MeetingSummary & {
  /** 当前会议的全部受邀成员。 */
  participants: MeetingParticipant[];
};

/** 在项目分区中创建会议的请求体。 */
export type CreateMeetingRequestPayload = {
  /** 会议所属讨论分区主键。 */
  areaId: number;
  /** 会议标题。 */
  title: string;
  /** 会议背景、目标或补充说明。 */
  description?: string;
  /** 计划开始时间。 */
  scheduledAt?: string;
  /** 计划持续分钟数；未传时由服务端使用 60 分钟。 */
  scheduledDurationMinutes?: number;
  /** 同一项目内需要关联的决策主键。 */
  decisionIds: number[];
  /** 当前分区可见成员中的受邀用户主键。 */
  participantIds: number[];
};

/** 浏览器加入 LiveKit 会议房间所需的短期凭证。 */
export type MeetingLiveKitCredentials = {
  /** LiveKit Cloud 或自托管服务的安全 WebSocket 地址。 */
  serverUrl: string;
  /** 仅允许当前用户加入当前会议房间的短期参与者令牌。 */
  participantToken: string;
};

/** 指定项目下当前用户可见的会议列表。 */
export type MeetingListResponse = MeetingSummary[];

/** 会议记录页允许筛选的终态。 */
export type MeetingCenterRecordStatus = Extract<MeetingStatus, 'ENDED' | 'CANCELLED'>;

/** 会议中心跨项目列表使用的会议摘要。 */
export type MeetingCenterListItem = MeetingSummary & {
  /** 会议所属项目标题。 */
  projectTitle: string;
  /** 当前用户在会议中的业务角色。 */
  currentUserRole: MeetingParticipantRole;
};

/** 会议中心周日程聚合查询参数。 */
export type MeetingCenterOverviewQuery = {
  /** 周范围开始时刻，包含该时刻，使用 ISO 8601。 */
  from: string;
  /** 周范围结束时刻，不包含该时刻，使用 ISO 8601。 */
  to: string;
  /** 可选的项目筛选主键。 */
  projectId?: number;
  /** 可选的当前用户会议角色筛选。 */
  role?: MeetingParticipantRole;
};

/** 会议中心周日程、进行中会议和后续会议聚合结果。 */
export type MeetingCenterOverviewResponse = {
  /** 指定周内有计划时间的会议。 */
  calendarItems: MeetingCenterListItem[];
  /** 当前用户正在参与的全部进行中会议。 */
  activeMeetings: MeetingCenterListItem[];
  /** 当前时间之后最近的三场待开始会议。 */
  upcomingMeetings: MeetingCenterListItem[];
};

/** 会议中心历史记录查询参数。 */
export type MeetingCenterRecordsQuery = {
  /** 按会议、项目或分区名称搜索的关键词。 */
  keyword?: string;
  /** 可选的项目筛选主键。 */
  projectId?: number;
  /** 可选的当前用户会议角色筛选。 */
  role?: MeetingParticipantRole;
  /** 可选的会议终态筛选。 */
  status?: MeetingCenterRecordStatus;
  /** 可选的记录时间范围开始时刻，包含该时刻。 */
  from?: string;
  /** 可选的记录时间范围结束时刻，不包含该时刻。 */
  to?: string;
  /** 当前页码，从 1 开始。 */
  page?: number;
  /** 单页记录数量。 */
  pageSize?: number;
};

/** 会议中心分页历史记录。 */
export type MeetingCenterRecordsResponse = {
  /** 当前页会议记录。 */
  items: MeetingCenterListItem[];
  /** 当前页码。 */
  page: number;
  /** 单页记录数量。 */
  pageSize: number;
  /** 符合筛选条件的记录总数。 */
  total: number;
};
