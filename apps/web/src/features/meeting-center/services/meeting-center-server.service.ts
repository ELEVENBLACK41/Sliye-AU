/**
 * 本文件负责新版会议中心 Server Component 的鉴权 Cookie 读取和接口解包。
 */
import { cookies } from 'next/headers';
import type {
  MeetingCenterOverviewQuery,
  MeetingCenterOverviewResponse,
  MeetingCenterRecordsQuery,
  MeetingCenterRecordsResponse,
} from '@workspace/contracts/meetings';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import type { MeetingCenterProjectOption } from '../types/meeting-center.types';
import {
  requestMeetingCenterOverviewFromNest,
  requestMeetingCenterProjectsFromNest,
  requestMeetingCenterRecordsFromNest,
} from './meeting-center-nest-client';

/** 查询会议中心日程概览。 */
export async function getMeetingCenterOverview(
  query: MeetingCenterOverviewQuery,
): Promise<MeetingCenterOverviewResponse> {
  return unwrap(await requestMeetingCenterOverviewFromNest(await getAccessToken(), query));
}

/** 查询会议中心历史记录。 */
export async function getMeetingCenterRecords(query: MeetingCenterRecordsQuery): Promise<MeetingCenterRecordsResponse> {
  return unwrap(await requestMeetingCenterRecordsFromNest(await getAccessToken(), query));
}

/** 查询项目并只暴露筛选器需要的字段。 */
export async function getMeetingCenterProjects(): Promise<MeetingCenterProjectOption[]> {
  const projects = unwrap(await requestMeetingCenterProjectsFromNest(await getAccessToken()));
  return projects.map(({ id, title }) => ({ id, title }));
}

/** 读取当前 httpOnly access token。 */
async function getAccessToken(): Promise<string> {
  const token = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;
  if (!token) throw new Error('登录状态已失效，请重新登录');
  return token;
}

/** 解包 NestJS 统一响应。 */
function unwrap<T>(response: NestResponse<T>): T {
  if (!response.body.success) throw new Error(response.body.message);
  return response.body.data;
}
