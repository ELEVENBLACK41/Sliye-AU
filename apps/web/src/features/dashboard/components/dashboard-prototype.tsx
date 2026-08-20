/**
 * 本文件组合新版工作台摘要和主体工作区的真实并行数据流。
 */
import type { AuthUser } from '@workspace/contracts/auth';
import type { DashboardInsightsResponse, DashboardSummaryResponse } from '@workspace/contracts/dashboard';
import type { MeetingCenterOverviewResponse } from '@workspace/contracts/meetings';

import { DashboardSummaryPlaceholder } from './dashboard-summary-placeholder';
import { DashboardWorkspacePlaceholder } from './dashboard-workspace-placeholder';

/** 新版工作台组合组件属性。 */
type DashboardPrototypeProps = {
  /** 当前登录用户。 */
  user: AuthUser;
  /** 已并行启动的摘要请求。 */
  summary: Promise<DashboardSummaryResponse>;
  /** 已并行启动的洞察请求。 */
  insights: Promise<DashboardInsightsResponse>;
  /** 已并行启动的会议中心周概览请求。 */
  meetings: Promise<MeetingCenterOverviewResponse>;
  /** 当前中国标准时间日期键。 */
  date: string;
};

/** 在保留新版 UI 信息架构的前提下组合真实工作台数据。 */
export function DashboardPrototype({ user, summary, insights, meetings, date }: DashboardPrototypeProps) {
  return (
    <>
      <DashboardSummaryPlaceholder user={user} data={summary} />
      <DashboardWorkspacePlaceholder user={user} insights={insights} meetings={meetings} date={date} />
    </>
  );
}
