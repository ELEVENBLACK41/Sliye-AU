/**
 * 本文件为新版会议中心提供路由级加载状态，覆盖认证校验与页面切换期间的等待过程。
 */
import { MeetingCenterLoading } from '@/features/meeting-center/components/meeting-center-loading';

/** 渲染新版会议中心页面加载骨架。 */
export default function MeetingsLoading() {
  return <MeetingCenterLoading />;
}
