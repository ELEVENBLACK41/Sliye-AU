/**
 * 本文件封装浏览器侧会议 BFF 请求。
 */
import type { MeetingDetail, MeetingLiveKitCredentials } from '@workspace/contracts/meetings';

import { requestData } from '@/services/request';

/** 开始指定会议。 */
export function startMeeting(meetingId: number): Promise<MeetingDetail> {
  return requestData<MeetingDetail>(`/api/meetings/${meetingId}/start`, {
    method: 'POST',
    errorMessage: '会议开始失败，请稍后重试',
  });
}

/** 结束指定会议。 */
export function endMeeting(meetingId: number): Promise<MeetingDetail> {
  return requestData<MeetingDetail>(`/api/meetings/${meetingId}/end`, {
    method: 'POST',
    errorMessage: '会议结束失败，请稍后重试',
  });
}

/** 获取当前用户加入指定会议音视频房间所需的短期凭证。 */
export function getMeetingLiveKitCredentials(meetingId: number): Promise<MeetingLiveKitCredentials> {
  return requestData<MeetingLiveKitCredentials>(`/api/meetings/${meetingId}/livekit-token`, {
    method: 'POST',
    errorMessage: '音视频凭证获取失败，请稍后重试',
  });
}
