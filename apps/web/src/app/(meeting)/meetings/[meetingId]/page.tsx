/**
 * 本文件保留会议一级地址，并统一进入新版自研 LiveKit 全屏房间。
 */
import { notFound, redirect } from 'next/navigation';

/** 会议兼容入口属性。 */
type MeetingEntryPageProps = {
  /** 动态会议主键。 */
  params: Promise<{ meetingId: string }>;
};

/** 校验会议主键后进入新版全屏房间。 */
export default async function MeetingEntryPage({ params }: MeetingEntryPageProps) {
  const meetingId = Number((await params).meetingId);
  if (!Number.isInteger(meetingId) || meetingId < 1) notFound();
  redirect(`/meetings/${meetingId}/room`);
}
