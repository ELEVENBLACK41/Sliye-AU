/**
 * 本文件封装议事模块在 Next.js 服务端调用 NestJS 的类型化请求。
 */
import type {
  DiscussionAreaListResponse,
  DiscussionAreaMemberListResponse,
  MatterChatMessageListQuery,
  MatterChatMessagePage,
  MatterDetail,
  MatterListResponse,
  MatterMemberCandidateListQuery,
  MatterMemberCandidateListResponse,
  MatterMemberListResponse,
} from '@workspace/contracts/matters';
import type { DecisionListResponse } from '@workspace/contracts/decisions';
import type { MeetingListResponse } from '@workspace/contracts/meetings';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询当前用户的议事列表。 */
export function requestMattersFromNest(accessToken: string): Promise<NestResponse<MatterListResponse>> {
  return requestNest<MatterListResponse>('/matters', { headers: createAuthHeaders(accessToken) });
}

/** 查询单项议事详情。 */
export function requestMatterDetailFromNest(
  accessToken: string,
  matterId: number,
): Promise<NestResponse<MatterDetail>> {
  return requestNest<MatterDetail>(`/matters/${matterId}`, { headers: createAuthHeaders(accessToken) });
}

/** 查询当前用户可见的讨论分区。 */
export function requestMatterAreasFromNest(
  accessToken: string,
  matterId: number,
): Promise<NestResponse<DiscussionAreaListResponse>> {
  return requestNest<DiscussionAreaListResponse>(`/matters/${matterId}/areas`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询议事成员。 */
export function requestMatterMembersFromNest(
  accessToken: string,
  matterId: number,
): Promise<NestResponse<MatterMemberListResponse>> {
  return requestNest<MatterMemberListResponse>(`/matters/${matterId}/members`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询尚未加入议事的可用用户候选。 */
export function requestMatterMemberCandidatesFromNest(
  accessToken: string,
  matterId: number,
  query: MatterMemberCandidateListQuery = {},
): Promise<NestResponse<MatterMemberCandidateListResponse>> {
  const searchParams = new URLSearchParams();
  if (query.q) searchParams.set('q', query.q);
  const suffix = searchParams.size > 0 ? `?${searchParams}` : '';
  return requestNest<MatterMemberCandidateListResponse>(`/matters/${matterId}/member-candidates${suffix}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询一个私有分区的显式成员。 */
export function requestAreaMembersFromNest(
  accessToken: string,
  matterId: number,
  areaId: number,
): Promise<NestResponse<DiscussionAreaMemberListResponse>> {
  return requestNest<DiscussionAreaMemberListResponse>(`/matters/${matterId}/areas/${areaId}/members`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询议事内的正式决策。 */
export function requestMatterDecisionsFromNest(
  accessToken: string,
  matterId: number,
): Promise<NestResponse<DecisionListResponse>> {
  return requestNest<DecisionListResponse>(`/matters/${matterId}/decisions`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询议事内当前用户可见的会议。 */
export function requestMatterMeetingsFromNest(
  accessToken: string,
  matterId: number,
): Promise<NestResponse<MeetingListResponse>> {
  return requestNest<MeetingListResponse>(`/matters/${matterId}/meetings`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询一个可见分区的消息页。 */
export function requestMatterMessagesFromNest(
  accessToken: string,
  matterId: number,
  areaId: number,
  query: MatterChatMessageListQuery = {},
): Promise<NestResponse<MatterChatMessagePage>> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });
  const suffix = searchParams.size > 0 ? `?${searchParams}` : '';

  return requestNest<MatterChatMessagePage>(`/matters/${matterId}/areas/${areaId}/messages${suffix}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造只在 Next.js 服务端使用的 Bearer 请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
