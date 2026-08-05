/**
 * 本文件封装新版项目空间 Server Component 调用 NestJS 所需的类型化只读请求。
 */
import type { DecisionListResponse } from '@workspace/contracts/decisions';
import type { MeetingListResponse } from '@workspace/contracts/meetings';
import type {
  DiscussionAreaMemberListResponse,
  DiscussionAreaListResponse,
  ProjectMemberCandidateListQuery,
  ProjectMemberCandidateListResponse,
  ProjectChatMessageListQuery,
  ProjectChatMessagePage,
  ProjectDetail,
  ProjectListResponse,
  ProjectMemberListResponse,
} from '@workspace/contracts/projects';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询当前用户可见的项目列表。 */
export function requestProjectSpaceProjects(accessToken: string): Promise<NestResponse<ProjectListResponse>> {
  return requestNest<ProjectListResponse>('/projects', { headers: createAuthHeaders(accessToken) });
}

/** 查询新版项目空间当前项目详情。 */
export function requestProjectSpaceDetail(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<ProjectDetail>> {
  return requestNest<ProjectDetail>(`/projects/${projectId}`, { headers: createAuthHeaders(accessToken) });
}

/** 查询新版项目空间当前用户可见的讨论分区。 */
export function requestProjectSpaceAreas(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<DiscussionAreaListResponse>> {
  return requestNest<DiscussionAreaListResponse>(`/projects/${projectId}/areas`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询新版项目空间当前私有分区的成员列表。 */
export function requestProjectSpaceAreaMembers(
  accessToken: string,
  projectId: number,
  areaId: number,
): Promise<NestResponse<DiscussionAreaMemberListResponse>> {
  return requestNest<DiscussionAreaMemberListResponse>(`/projects/${projectId}/areas/${areaId}/members`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询新版项目空间当前项目成员。 */
export function requestProjectSpaceMembers(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<ProjectMemberListResponse>> {
  return requestNest<ProjectMemberListResponse>(`/projects/${projectId}/members`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询新版项目空间当前项目尚可添加的组织用户。 */
export function requestProjectSpaceMemberCandidates(
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

/** 查询新版项目空间当前项目内的决策摘要。 */
export function requestProjectSpaceDecisions(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<DecisionListResponse>> {
  return requestNest<DecisionListResponse>(`/projects/${projectId}/decisions`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询新版项目空间当前用户可见的会议摘要。 */
export function requestProjectSpaceMeetings(
  accessToken: string,
  projectId: number,
): Promise<NestResponse<MeetingListResponse>> {
  return requestNest<MeetingListResponse>(`/projects/${projectId}/meetings`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询新版项目空间一个可见分区的消息页。 */
export function requestProjectSpaceMessages(
  accessToken: string,
  projectId: number,
  areaId: number,
  query: ProjectChatMessageListQuery = {},
): Promise<NestResponse<ProjectChatMessagePage>> {
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) searchParams.set(key, String(value));
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
