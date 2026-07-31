/**
 * 本文件封装项目模块在 Next.js 服务端调用 NestJS 的类型化请求。
 */
import type {
  DiscussionAreaListResponse,
  DiscussionAreaMemberListResponse,
  ProjectChatMessageListQuery,
  ProjectChatMessagePage,
  ProjectDetail,
  ProjectListResponse,
  ProjectMemberCandidateListQuery,
  ProjectMemberCandidateListResponse,
  ProjectMemberListResponse,
} from '@workspace/contracts/projects';
import type { DecisionListResponse } from '@workspace/contracts/decisions';
import type { MeetingListResponse } from '@workspace/contracts/meetings';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询当前用户的项目列表。 */
export function requestProjectsFromNest(accessToken: string): Promise<NestResponse<ProjectListResponse>> {
  return requestNest<ProjectListResponse>('/projects', { headers: createAuthHeaders(accessToken) });
}

/** 查询单项项目详情。 */
export function requestProjectDetailFromNest(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<ProjectDetail>> {
  return requestNest<ProjectDetail>(`/projects/${projectId}`, { headers: createAuthHeaders(accessToken) });
}

/** 查询当前用户可见的讨论分区。 */
export function requestProjectAreasFromNest(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<DiscussionAreaListResponse>> {
  return requestNest<DiscussionAreaListResponse>(`/projects/${projectId}/areas`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询项目成员。 */
export function requestProjectMembersFromNest(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<ProjectMemberListResponse>> {
  return requestNest<ProjectMemberListResponse>(`/projects/${projectId}/members`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询尚未加入项目的可用用户候选。 */
export function requestProjectMemberCandidatesFromNest(
  accessToken: string,
  projectId: number,
  query: ProjectMemberCandidateListQuery = {},
): Promise<NestResponse<ProjectMemberCandidateListResponse>> {
  const searchParams = new URLSearchParams();
  if (query.q) searchParams.set('q', query.q);
  const suffix = searchParams.size > 0 ? `?${searchParams}` : '';
  return requestNest<ProjectMemberCandidateListResponse>(`/projects/${projectId}/member-candidates${suffix}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询一个私有分区的显式成员。 */
export function requestAreaMembersFromNest(
  accessToken: string,
  projectId: number,
  areaId: number,
): Promise<NestResponse<DiscussionAreaMemberListResponse>> {
  return requestNest<DiscussionAreaMemberListResponse>(`/projects/${projectId}/areas/${areaId}/members`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询项目内的正式决策。 */
export function requestProjectDecisionsFromNest(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<DecisionListResponse>> {
  return requestNest<DecisionListResponse>(`/projects/${projectId}/decisions`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询项目内当前用户可见的会议。 */
export function requestProjectMeetingsFromNest(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<MeetingListResponse>> {
  return requestNest<MeetingListResponse>(`/projects/${projectId}/meetings`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询一个可见分区的消息页。 */
export function requestProjectMessagesFromNest(
  accessToken: string,
  projectId: number,
  areaId: number,
  query: ProjectChatMessageListQuery = {},
): Promise<NestResponse<ProjectChatMessagePage>> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  });
  const suffix = searchParams.size > 0 ? `?${searchParams}` : '';

  return requestNest<ProjectChatMessagePage>(`/projects/${projectId}/areas/${areaId}/messages${suffix}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 构造只在 Next.js 服务端使用的 Bearer 请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
