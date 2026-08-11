/**
 * 本文件提供新版会议中心路由入口，当前仅渲染前端页面结构，不读取会议业务数据。
 */
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { requireServerPermission } from '@/features/auth/services/auth-server.service';
import { MeetingCenterPage } from '@/features/meeting-center/components/meeting-center-page';

/** 渲染通过工作台访问校验后的新版会议中心首页。 */
export default async function MeetingsPage() {
  await requireServerPermission(SYSTEM_PERMISSIONS.dashboard.access);

  return <MeetingCenterPage />;
}
