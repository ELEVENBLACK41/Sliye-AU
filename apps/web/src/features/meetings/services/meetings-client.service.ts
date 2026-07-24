/**
 * 本文件封装浏览器侧会议 BFF 请求。
 */
import type { CreateMeetingRequestPayload, MeetingDetail } from '@workspace/contracts/meetings';

import { requestData } from '@/services/request';

/** 在指定决策中创建会议。 */
export function createMeeting(decisionId: number, payload: CreateMeetingRequestPayload): Promise<MeetingDetail> {
  return requestData<MeetingDetail, CreateMeetingRequestPayload>(`/api/decisions/${decisionId}/meetings`, {
    method: 'POST',
    body: payload,
    errorMessage: '会议创建失败，请稍后重试',
  });
}

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
