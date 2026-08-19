/**
 * 本文件定义新版工作台客户端组件所需的最小可序列化数据结构。
 */
import type { MeetingStatus } from '@workspace/contracts/meetings';

/** 工作台会议时间线实际使用的最小会议摘要。 */
export type DashboardMeetingScheduleItem = {
  /** 会议数据库主键。 */
  id: number;
  /** 会议标题。 */
  title: string;
  /** 会议当前业务状态。 */
  status: MeetingStatus;
  /** 当前会议受邀成员数量。 */
  participantCount: number;
  /** 所属项目标题；独立会议为 null。 */
  projectTitle: string | null;
  /** 所属分区名称；独立会议为 null。 */
  areaName: string | null;
  /** 计划开始时间。 */
  scheduledAt: string | null;
  /** 计划持续分钟数。 */
  scheduledDurationMinutes: number | null;
  /** 实际开始时间。 */
  startedAt: string | null;
  /** 会议创建时间。 */
  createdAt: string;
};
