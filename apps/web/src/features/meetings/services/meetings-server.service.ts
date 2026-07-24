/**
 * 本文件封装会议页面的服务端数据读取，并保留上游结构化错误。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type { MeetingDetail, MeetingListResponse } from '@workspace/contracts/meetings';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import { requestDecisionMeetingsFromNest, requestMeetingDetailFromNest } from './meetings-nest-client';

/** Server Component 调用会议接口时使用的结构化异常。 */
export class MeetingServerError extends Error {
  /** 上游 HTTP 状态码。 */
  readonly status: number;
  /** 前后端共享业务错误码。 */
  readonly code: ApiErrorCode;
  /** 链路请求编号。 */
  readonly requestId: string;

  /** 根据上游错误响应构造页面异常。 */
  constructor(status: number, code: ApiErrorCode, message: string, requestId: string) {
    super(message);
    this.name = 'MeetingServerError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 查询指定决策下的会议列表。 */
export const getDecisionMeetings = cache(async (decisionId: number): Promise<MeetingListResponse> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(await requestDecisionMeetingsFromNest(accessToken, decisionId));
});

/** 查询一场授权范围内的会议详情。 */
export const getMeetingDetail = cache(async (meetingId: number): Promise<MeetingDetail> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(await requestMeetingDetailFromNest(accessToken, meetingId));
});

/** 从 httpOnly Cookie 读取访问令牌。 */
async function getAccessToken(): Promise<string> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;

  if (!accessToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  return accessToken;
}

/** 解包 NestJS 响应并转换失败结果。 */
function unwrapResponse<T>(response: NestResponse<T>): T {
  if (!response.body.success) {
    throw new MeetingServerError(response.status, response.body.code, response.body.message, response.body.requestId);
  }

  return response.body.data;
}
