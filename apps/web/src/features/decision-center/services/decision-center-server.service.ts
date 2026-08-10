/**
 * 本文件负责新版决策中心三个流式区域的服务端首屏数据读取。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type { DecisionCenterArchiveQuery } from '@workspace/contracts/decisions';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import {
  requestDecisionCenterActivity,
  requestDecisionCenterAnalytics,
  requestDecisionCenterArchive,
} from './decision-center-nest-client';

/** 决策中心服务端读取失败时保留的结构化业务异常。 */
export class DecisionCenterServerError extends Error {
  /** NestJS 返回的 HTTP 状态码。 */
  readonly status: number;
  /** 前后端共享的业务错误码。 */
  readonly code: ApiErrorCode;
  /** 贯穿请求链路的请求编号。 */
  readonly requestId: string;

  /** 从上游失败响应构造决策中心异常。 */
  constructor(status: number, code: ApiErrorCode, message: string, requestId: string) {
    super(message);
    this.name = 'DecisionCenterServerError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 读取决策活动热力图与默认日档案。 */
export const getDecisionCenterActivity = cache(async () =>
  unwrap(await requestDecisionCenterActivity(await getAccessToken())),
);

/** 读取跨项目过程分析。 */
export const getDecisionCenterAnalytics = cache(async () =>
  unwrap(await requestDecisionCenterAnalytics(await getAccessToken())),
);

/** 读取跨项目决策档案。 */
export const getDecisionCenterArchive = cache(async (query: DecisionCenterArchiveQuery = {}) =>
  unwrap(await requestDecisionCenterArchive(await getAccessToken(), query)),
);

/** 从 httpOnly Cookie 读取访问令牌。 */
async function getAccessToken(): Promise<string> {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;
  if (!accessToken) throw new Error('登录状态已失效，请重新登录');
  return accessToken;
}

/** 解包统一响应并保留上游失败上下文。 */
function unwrap<T>(response: NestResponse<T>): T {
  if (!response.body.success) {
    throw new DecisionCenterServerError(
      response.status,
      response.body.code,
      response.body.message,
      response.body.requestId,
    );
  }
  return response.body.data;
}
