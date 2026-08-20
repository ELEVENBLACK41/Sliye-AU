/**
 * 本文件提供新版工作台 Server Component 入口并并行启动分块数据流。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { DashboardPrototype } from '@/features/dashboard/components/dashboard-prototype';
import { getDashboardInsights, getDashboardSummary } from '@/features/dashboard/services/dashboard-server.service';
import { getMeetingCenterOverview } from '@/features/meeting-center/services/meeting-center-server.service';
import { formatShanghaiDate, getShanghaiWeekRange } from '@/features/meeting-center/utils/meeting-center-query';

/** 校验工作台权限，并在渲染前并行启动摘要、洞察和会议周概览请求。 */
export default async function MainPage() {
  const user = await requireServerPermission(SYSTEM_PERMISSIONS.dashboard.access);
  const date = formatShanghaiDate(new Date());
  const summaryPromise = getDashboardSummary();
  const insightsPromise = getDashboardInsights();
  const meetingsPromise = getMeetingCenterOverview(getShanghaiWeekRange(date));

  return (
    <DashboardPrototype
      user={user}
      summary={summaryPromise}
      insights={insightsPromise}
      meetings={meetingsPromise}
      date={date}
    />
  );
}
