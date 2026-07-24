/**
 * 本文件封装会议模块在 Next.js 服务端调用 NestJS 的类型化请求。
 */
import type { CreateMeetingRequestPayload, MeetingDetail, MeetingListResponse } from '@workspace/contracts/meetings';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询指定决策下的会议列表。 */
export function requestDecisionMeetingsFromNest(
  accessToken: string,
  decisionId: number,
): Promise<NestResponse<MeetingListResponse>> {
  return requestNest<MeetingListResponse>(`/decisions/${decisionId}/meetings`, {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询一场会议的详情与受邀成员。 */
export function requestMeetingDetailFromNest(
  accessToken: string,
  meetingId: number,
): Promise<NestResponse<MeetingDetail>> {
  return requestNest<MeetingDetail>(`/meetings/${meetingId}`, {
    method: 'GET',
    headers: createAuthHeaders(accessToken),
  });
}

/** 创建一场决策会议。 */
export function requestMeetingCreateFromNest(
  accessToken: string,
  decisionId: number,
  payload: CreateMeetingRequestPayload,
): Promise<NestResponse<MeetingDetail>> {
  return requestNest<MeetingDetail, CreateMeetingRequestPayload>(`/decisions/${decisionId}/meetings`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken),
    body: payload,
  });
}

/** 开始一场计划中的会议。 */
export function requestMeetingStartFromNest(
  accessToken: string,
  meetingId: number,
): Promise<NestResponse<MeetingDetail>> {
  return requestNest<MeetingDetail>(`/meetings/${meetingId}/start`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken),
  });
}

/** 结束一场进行中的会议。 */
export function requestMeetingEndFromNest(
  accessToken: string,
  meetingId: number,
): Promise<NestResponse<MeetingDetail>> {
  return requestNest<MeetingDetail>(`/meetings/${meetingId}/end`, {
    method: 'POST',
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造只在 Next.js 服务端使用的 Bearer 请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
