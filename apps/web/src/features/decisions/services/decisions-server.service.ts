/**
 * 本文件封装决策的 Next.js 服务端请求，并保留上游 HTTP 状态、业务码和请求编号。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type {
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionProposalListResponse,
  DecisionSummary,
  UpdateDecisionStatusRequestPayload,
} from '@workspace/contracts/decisions';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import {
  requestDecisionDetailFromNest,
  requestDecisionEventsFromNest,
  requestDecisionProposalsFromNest,
  requestDecisionStatusUpdateFromNest,
  requestDecisionsFromNest,
} from './decisions-nest-client';

/** Server Component 调用 NestJS 时抛出的结构化业务错误。 */
export class DecisionServerError extends Error {
  /** NestJS 返回的 HTTP 状态。 */
  readonly status: number;
  /** 前后端共享的稳定业务错误码。 */
  readonly code: ApiErrorCode;
  /** 贯穿请求链路的请求编号。 */
  readonly requestId: string;

  /** 根据上游失败响应创建服务端页面异常。 */
  constructor(status: number, code: ApiErrorCode, message: string, requestId: string) {
    super(message);
    this.name = 'DecisionServerError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 读取当前用户经过数据范围裁剪后的决策列表。 */
export const getDecisionSummaries = cache(async (): Promise<DecisionSummary[]> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(await requestDecisionsFromNest(accessToken));
});

/** 按资源 ID 读取决策详情；越权与不存在均由后端返回相同 404。 */
export const getDecisionDetail = cache(async (decisionId: number): Promise<DecisionDetail> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(await requestDecisionDetailFromNest(accessToken, decisionId));
});

/** 按资源 ID 读取决策事件时间线；越权与不存在均由后端返回相同 404。 */
export const getDecisionEvents = cache(async (decisionId: number): Promise<DecisionEventTimelineResponse> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(await requestDecisionEventsFromNest(accessToken, decisionId));
});

/** 按资源 ID 读取决策提案列表；越权与不存在均由后端返回相同 404。 */
export const getDecisionProposals = cache(async (decisionId: number): Promise<DecisionProposalListResponse> => {
  const accessToken = await getAccessToken();

  return unwrapResponse(await requestDecisionProposalsFromNest(accessToken, decisionId));
});

/** 在 Next.js 服务端更新决策状态；写请求不使用 React cache。 */
export async function updateDecisionStatus(
  decisionId: number,
  payload: UpdateDecisionStatusRequestPayload,
): Promise<DecisionDetail> {
  const accessToken = await getAccessToken();

  return unwrapResponse(await requestDecisionStatusUpdateFromNest(accessToken, decisionId, payload));
}

/** 从 httpOnly Cookie 读取访问令牌，令牌不会传入浏览器组件。 */
async function getAccessToken(): Promise<string> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;

  if (!accessToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  return accessToken;
}

/** 解包 NestJS 可判别响应，并把失败信息转换为服务端结构化错误。 */
function unwrapResponse<T>(response: NestResponse<T>): T {
  if (!response.body.success) {
    throw new DecisionServerError(response.status, response.body.code, response.body.message, response.body.requestId);
  }

  return response.body.data;
}
