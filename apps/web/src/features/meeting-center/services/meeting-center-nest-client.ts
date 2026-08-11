/**
 * 本文件封装新版会议中心在 Next.js 服务端调用 NestJS 的独立类型化请求。
 */
import type {
  MeetingCenterOverviewQuery,
  MeetingCenterOverviewResponse,
  MeetingCenterRecordsQuery,
  MeetingCenterRecordsResponse,
} from '@workspace/contracts/meetings';
import type { ProjectListResponse } from '@workspace/contracts/projects';

import { requestNest, type NestResponse } from '@/services/bff-request';

/** 查询会议中心日程概览。 */
export function requestMeetingCenterOverviewFromNest(
  accessToken: string,
  query: MeetingCenterOverviewQuery,
): Promise<NestResponse<MeetingCenterOverviewResponse>> {
  return requestNest<MeetingCenterOverviewResponse>(`/meetings/center/overview?${toSearchParams(query)}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询会议中心历史记录。 */
export function requestMeetingCenterRecordsFromNest(
  accessToken: string,
  query: MeetingCenterRecordsQuery,
): Promise<NestResponse<MeetingCenterRecordsResponse>> {
  return requestNest<MeetingCenterRecordsResponse>(`/meetings/center/records?${toSearchParams(query)}`, {
    headers: createAuthHeaders(accessToken),
  });
}

/** 查询会议中心项目筛选选项。 */
export function requestMeetingCenterProjectsFromNest(accessToken: string): Promise<NestResponse<ProjectListResponse>> {
  return requestNest<ProjectListResponse>('/projects', { headers: createAuthHeaders(accessToken) });
}

/** 将契约查询对象转换为 URLSearchParams。 */
function toSearchParams(query: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  return params;
}

/** 构造服务端 Bearer 请求头。 */
function createAuthHeaders(accessToken: string): HeadersInit {
  return { Authorization: `Bearer ${accessToken}` };
}
