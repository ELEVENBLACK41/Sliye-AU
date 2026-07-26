/**
 * 本文件封装议事页面的 Next.js 服务端数据读取与结构化错误。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type { MatterChatMessageListQuery, MatterMemberCandidateListQuery } from '@workspace/contracts/matters';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import {
  requestMatterAreasFromNest,
  requestAreaMembersFromNest,
  requestMatterDecisionsFromNest,
  requestMatterDetailFromNest,
  requestMatterMeetingsFromNest,
  requestMatterMemberCandidatesFromNest,
  requestMatterMembersFromNest,
  requestMatterMessagesFromNest,
  requestMattersFromNest,
} from './matters-nest-client';

/** 议事 Server Component 数据读取失败时抛出的结构化异常。 */
export class MatterServerError extends Error {
  /** NestJS 返回的 HTTP 状态码。 */
  readonly status: number;
  /** 前后端共享的业务错误码。 */
  readonly code: ApiErrorCode;
  /** 请求链路编号。 */
  readonly requestId: string;

  /** 从上游失败响应构造页面异常。 */
  constructor(status: number, code: ApiErrorCode, message: string, requestId: string) {
    super(message);
    this.name = 'MatterServerError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 读取议事列表。 */
export const getMatters = cache(async () => unwrap(await requestMattersFromNest(await getAccessToken())));

/** 读取单项议事详情。 */
export const getMatter = cache(async (matterId: number) =>
  unwrap(await requestMatterDetailFromNest(await getAccessToken(), matterId)),
);

/** 读取议事的可见分区。 */
export const getMatterAreas = cache(async (matterId: number) =>
  unwrap(await requestMatterAreasFromNest(await getAccessToken(), matterId)),
);

/** 读取议事成员。 */
export const getMatterMembers = cache(async (matterId: number) =>
  unwrap(await requestMatterMembersFromNest(await getAccessToken(), matterId)),
);

/** 读取尚未加入当前议事的可用用户候选。 */
export const getMatterMemberCandidates = cache(async (matterId: number, query: MatterMemberCandidateListQuery = {}) =>
  unwrap(await requestMatterMemberCandidatesFromNest(await getAccessToken(), matterId, query)),
);

/** 读取私有分区的显式成员。 */
export const getAreaMembers = cache(async (matterId: number, areaId: number) =>
  unwrap(await requestAreaMembersFromNest(await getAccessToken(), matterId, areaId)),
);

/** 读取议事内的决策。 */
export const getMatterDecisions = cache(async (matterId: number) =>
  unwrap(await requestMatterDecisionsFromNest(await getAccessToken(), matterId)),
);

/** 读取议事内当前可见会议。 */
export const getMatterMeetings = cache(async (matterId: number) =>
  unwrap(await requestMatterMeetingsFromNest(await getAccessToken(), matterId)),
);

/** 读取当前分区首屏消息。 */
export const getMatterMessages = cache(
  async (matterId: number, areaId: number, query: MatterChatMessageListQuery = {}) =>
    unwrap(
      await requestMatterMessagesFromNest(await getAccessToken(), matterId, areaId, {
        direction: 'before',
        limit: 30,
        ...query,
      }),
    ),
);

/** 读取 httpOnly Cookie 中的访问令牌。 */
async function getAccessToken(): Promise<string> {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;
  if (!accessToken) {
    throw new Error('登录状态已失效，请重新登录');
  }
  return accessToken;
}

/** 解包 NestJS 响应并保留失败上下文。 */
function unwrap<T>(response: NestResponse<T>): T {
  if (!response.body.success) {
    throw new MatterServerError(response.status, response.body.code, response.body.message, response.body.requestId);
  }
  return response.body.data;
}
