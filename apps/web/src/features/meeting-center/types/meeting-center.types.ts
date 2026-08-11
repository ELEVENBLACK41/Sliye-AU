/**
 * 本文件定义新版会议中心页面内部使用的 URL 状态与项目筛选选项。
 */
import type { MeetingCenterRecordStatus, MeetingParticipantRole } from '@workspace/contracts/meetings';

/** 会议中心支持的一级视图。 */
export type MeetingCenterView = 'schedule' | 'records';

/** 从 URL 解析后交给会议中心页面的稳定查询状态。 */
export type MeetingCenterPageQuery = {
  /** 当前一级视图。 */
  view: MeetingCenterView;
  /** 作为周视图锚点的 UTC+8 日期。 */
  date: string;
  /** 可选项目主键。 */
  projectId?: number;
  /** 当前用户在会议中的可选角色。 */
  role?: MeetingParticipantRole;
  /** 历史记录可选终态。 */
  status?: MeetingCenterRecordStatus;
  /** 历史记录搜索词。 */
  keyword?: string;
  /** 历史记录 UTC+8 起始日期。 */
  from?: string;
  /** 历史记录 UTC+8 结束日期。 */
  to?: string;
  /** 历史记录页码。 */
  page: number;
};

/** 项目筛选控件只需要的轻量选项。 */
export type MeetingCenterProjectOption = {
  /** 项目主键。 */
  id: number;
  /** 项目标题。 */
  title: string;
};
