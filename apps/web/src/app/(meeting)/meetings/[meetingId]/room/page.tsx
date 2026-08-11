/**
 * 本文件提供新版全屏会议房间路由，目前仅展示前端原型，不读取会议业务数据。
 */
import { MeetingRoomPreviewPage } from '@/features/meeting-room/components/meeting-room-preview-page';

/** 渲染独立于新版顶部导航的会议房间前端预览。 */
export default function MeetingRoomPage() {
  return <MeetingRoomPreviewPage />;
}
