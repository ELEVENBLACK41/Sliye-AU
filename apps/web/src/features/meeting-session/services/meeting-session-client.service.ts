/**
 * 本文件封装新版全局会议会话使用的 LiveKit 凭证与结束会议 BFF 请求。
 */
import type { MeetingDetail, MeetingLiveKitCredentials } from '@workspace/contracts/meetings';

import { requestData } from '@/services/request';

/** 获取当前参与人加入新版 LiveKit 房间的短期凭证。 */
export function getMeetingSessionCredentials(meetingId: number): Promise<MeetingLiveKitCredentials> {
  return requestData(`/api/meetings/${meetingId}/livekit-token`, {
    method: 'POST',
    errorMessage: '会议连接凭证获取失败',
  });
}

/** 由主持人结束业务会议并关闭 LiveKit 房间。 */
export function endMeetingSession(meetingId: number): Promise<MeetingDetail> {
  return requestData(`/api/meetings/${meetingId}/end`, {
    method: 'POST',
    errorMessage: '结束会议失败，请稍后重试',
  });
}
