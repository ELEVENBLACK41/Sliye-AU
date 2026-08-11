/**
 * 本文件提供新版全屏自研 LiveKit 会议房间路由。
 */
import { notFound } from 'next/navigation';

import { requireReadyUser } from '@/features/auth/services/auth-server.service';
import { MeetingRoomLivePage } from '@/features/meeting-room/components/meeting-room-live-page';
import { getMeetingRoomDetail } from '@/features/meeting-room/services/meeting-room-server.service';

/** 新版会议房间路由属性。 */
type MeetingRoomPageProps = {
  /** Next.js 16 异步动态参数。 */
  params: Promise<{ meetingId: string }>;
};

/** 读取真实会议和当前用户后渲染独立全屏房间。 */
export default async function MeetingRoomPage({ params }: MeetingRoomPageProps) {
  const meetingId = Number((await params).meetingId);
  if (!Number.isInteger(meetingId) || meetingId < 1) notFound();
  const [meeting, user] = await Promise.all([
    getMeetingRoomDetail(meetingId),
    requireReadyUser(),
  ]);
  return <MeetingRoomLivePage meeting={meeting} currentUserId={user.id} />;
}
