/**
 * 本文件提供新版会议中心 Server Component 入口并按 URL 状态读取真实会议数据。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { MeetingCenterPage } from '@/features/meeting-center/components/meeting-center-page';
import {
  getMeetingCenterOverview,
  getMeetingCenterProjects,
  getMeetingCenterRecords,
} from '@/features/meeting-center/services/meeting-center-server.service';
import {
  createOverviewQuery,
  createRecordsQuery,
  parseMeetingCenterPageQuery,
  type MeetingCenterSearchParams,
} from '@/features/meeting-center/utils/meeting-center-query';

/** 会议中心页面异步 URL 参数。 */
type MeetingsPageProps = {
  /** Next.js 传入的查询参数。 */
  searchParams: Promise<MeetingCenterSearchParams>;
};

/** 渲染通过工作台访问校验后的新版会议中心首页。 */
export default async function MeetingsPage({ searchParams }: MeetingsPageProps) {
  await requireServerPermission(SYSTEM_PERMISSIONS.dashboard.access);
  const query = parseMeetingCenterPageQuery(await searchParams);
  const projectsPromise = getMeetingCenterProjects();

  if (query.view === 'records') {
    const [projects, records] = await Promise.all([
      projectsPromise,
      getMeetingCenterRecords(createRecordsQuery(query)),
    ]);

    return <MeetingCenterPage query={query} projects={projects} records={records} />;
  }

  const [projects, overview] = await Promise.all([
    projectsPromise,
    getMeetingCenterOverview(createOverviewQuery(query)),
  ]);

  return <MeetingCenterPage query={query} projects={projects} overview={overview} />;
}
