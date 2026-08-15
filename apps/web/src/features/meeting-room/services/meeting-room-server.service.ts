/**
 * 本文件为新版会议房间 Server Component 独立读取会议详情。
 */
import { cookies } from 'next/headers';
import type { MeetingDetail } from '@workspace/contracts/meetings';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import { requestNest } from '@/services/bff-request';

/** 查询当前受邀用户可访问的单场会议详情。 */
export async function getMeetingRoomDetail(meetingId: number): Promise<MeetingDetail> {
  const token = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;
  if (!token) throw new Error('登录状态已失效，请重新登录');
  const response = await requestNest<MeetingDetail>(`/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.body.success) throw new Error(response.body.message);
  return response.body.data;
}
