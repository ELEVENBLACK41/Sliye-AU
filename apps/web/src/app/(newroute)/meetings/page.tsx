/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-08-13 14:10:17
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-08-14 16:50:27
 * @FilePath: \NextNest\apps\web\src\app\(newroute)\meetings\page.tsx
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * 本文件提供新版会议中心 Server Component 入口并按 URL 状态读取真实会议数据。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';
import type { MeetingCenterListItem, MeetingDetail } from '@workspace/contracts/meetings';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { MeetingCenterPage } from '@/features/meeting-center/components/meeting-center-page';
import {
  getMeetingCenterOverview,
  getMeetingCenterProjects,
  getMeetingCenterRecords,
} from '@/features/meeting-center/services/meeting-center-server.service';
import { getMeetingRoomDetail } from '@/features/meeting-room/services/meeting-room-server.service';
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
  const currentUser = await requireServerPermission(SYSTEM_PERMISSIONS.dashboard.access);
  const query = parseMeetingCenterPageQuery(await searchParams);
  const projectsPromise = getMeetingCenterProjects();
  const selectedMeetingPromise = query.meetingId
    ? getMeetingRoomDetail(query.meetingId).then((detail) =>
        createMeetingCenterListItem(detail, currentUser.id),
      )
    : Promise.resolve(undefined);

  if (query.view === 'records') {
    const [projects, records, selectedMeeting] = await Promise.all([
      projectsPromise,
      getMeetingCenterRecords(createRecordsQuery(query)),
      selectedMeetingPromise,
    ]);

    return (
      <MeetingCenterPage
        query={query}
        projects={projects}
        records={records}
        selectedMeeting={selectedMeeting}
      />
    );
  }

  const [projects, overview, selectedMeeting] = await Promise.all([
    projectsPromise,
    getMeetingCenterOverview(createOverviewQuery(query)),
    selectedMeetingPromise,
  ]);

  return (
    <MeetingCenterPage
      query={query}
      projects={projects}
      overview={overview}
      selectedMeeting={selectedMeeting}
    />
  );
}

/** 将单场授权会议详情转换成会议中心详情 Sheet 可直接使用的摘要。 */
function createMeetingCenterListItem(
  detail: MeetingDetail,
  currentUserId: number,
): MeetingCenterListItem {
  return {
    ...detail,
    projectTitle: null,
    currentUserRole:
      detail.participants.find((participant) => participant.user.id === currentUserId)?.role ??
      'ATTENDEE',
  };
}
