/**
 * 本文件封装会议中心详情抽屉使用的浏览器端请求。
 */
import type {
  CreateAppointmentRequestPayload,
  CreateQuickCallRequestPayload,
  IncomingMeetingCallsResponse,
  MeetingDetail,
  MeetingParticipantCandidatesResponse,
  RespondMeetingCallRequestPayload,
  UpdateAppointmentRequestPayload,
} from '@workspace/contracts/meetings';
import type { DecisionListResponse } from '@workspace/contracts/decisions';
import type { DiscussionAreaListResponse } from '@workspace/contracts/projects';

import { requestData } from '@/services/request';

/** 懒加载指定会议详情与参与人。 */
export function getMeetingCenterDetail(meetingId: number): Promise<MeetingDetail> {
  return requestData<MeetingDetail>(`/api/meetings/${meetingId}`, {
    errorMessage: '会议详情加载失败，请稍后重试',
  });
}

/** 按关键词查询独立会议联系人。 */
export function getMeetingParticipantCandidates(keyword = ''): Promise<MeetingParticipantCandidatesResponse> {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (keyword.trim()) params.set('keyword', keyword.trim());
  return requestData(`/api/meetings/participant-candidates?${params}`, {
    errorMessage: '联系人加载失败，请稍后重试',
  });
}

/** 发起三十秒振铃的快速通话。 */
export function createQuickCall(payload: CreateQuickCallRequestPayload): Promise<MeetingDetail> {
  return requestData<MeetingDetail, CreateQuickCallRequestPayload>('/api/meetings/quick-calls', {
    method: 'POST',
    body: payload,
    errorMessage: '快速通话发起失败，请稍后重试',
  });
}

/** 创建预约会议。 */
export function createAppointment(payload: CreateAppointmentRequestPayload): Promise<MeetingDetail> {
  return requestData<MeetingDetail, CreateAppointmentRequestPayload>('/api/meetings/appointments', {
    method: 'POST',
    body: payload,
    errorMessage: '预约会议创建失败，请稍后重试',
  });
}

/** 查询刷新后仍可响应的快速来电。 */
export function getIncomingMeetingCalls(): Promise<IncomingMeetingCallsResponse> {
  return requestData('/api/meetings/incoming-calls', {
    errorMessage: '待处理来电加载失败',
  });
}

/** 接听或拒绝快速通话。 */
export function respondToMeetingCall(
  meetingId: number,
  payload: RespondMeetingCallRequestPayload,
): Promise<MeetingDetail> {
  return requestData<MeetingDetail, RespondMeetingCallRequestPayload>(`/api/meetings/${meetingId}/call-response`, {
    method: 'POST',
    body: payload,
    errorMessage: '来电响应失败，请稍后重试',
  });
}

/** 加载可选项目中的会议分区。 */
export function getMeetingContextAreas(projectId: number): Promise<DiscussionAreaListResponse> {
  return requestData(`/api/projects/${projectId}/areas`, {
    errorMessage: '项目分区加载失败',
  });
}

/** 加载可选项目中的会议决策。 */
export function getMeetingContextDecisions(projectId: number): Promise<DecisionListResponse> {
  return requestData(`/api/projects/${projectId}/decisions`, {
    errorMessage: '项目决策加载失败',
  });
}

/** 修改尚未开始的预约会议。 */
export function updateAppointment(meetingId: number, payload: UpdateAppointmentRequestPayload): Promise<MeetingDetail> {
  return requestData<MeetingDetail, UpdateAppointmentRequestPayload>(`/api/meetings/${meetingId}`, {
    method: 'PATCH',
    body: payload,
    errorMessage: '预约会议修改失败',
  });
}

/** 取消尚未开始的预约会议。 */
export function cancelAppointment(meetingId: number): Promise<MeetingDetail> {
  return requestData(`/api/meetings/${meetingId}/cancel`, {
    method: 'POST',
    errorMessage: '预约会议取消失败',
  });
}
