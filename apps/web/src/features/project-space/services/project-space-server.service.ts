/**
 * 本文件封装新版项目空间的服务端首屏数据读取与结构化错误。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type { ProjectChatMessageListQuery, ProjectMemberCandidateListQuery } from '@workspace/contracts/projects';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import {
  requestProjectSpaceAreas,
  requestProjectSpaceAreaMembers,
  requestProjectSpaceDecisions,
  requestProjectSpaceDetail,
  requestProjectSpaceMeetings,
  requestProjectSpaceMembers,
  requestProjectSpaceMemberCandidates,
  requestProjectSpaceMessages,
  requestProjectSpaceProjects,
} from './project-space-nest-client';

/** 新版项目空间服务端读取失败时抛出的结构化异常。 */
export class ProjectSpaceServerError extends Error {
  /** NestJS 返回的 HTTP 状态码。 */
  readonly status: number;
  /** 前后端共享的业务错误码。 */
  readonly code: ApiErrorCode;
  /** 请求链路编号。 */
  readonly requestId: string;

  /** 从上游失败响应构造新版项目空间异常。 */
  constructor(status: number, code: ApiErrorCode, message: string, requestId: string) {
    super(message);
    this.name = 'ProjectSpaceServerError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 读取新版项目空间的项目列表。 */
export const getProjectSpaceProjects = cache(async () =>
  unwrap(await requestProjectSpaceProjects(await getAccessToken())),
);

/** 读取新版项目空间的当前项目详情。 */
export const getProjectSpaceProject = cache(async (projectId: number) =>
  unwrap(await requestProjectSpaceDetail(await getAccessToken(), projectId)),
);

/** 读取新版项目空间当前项目的可见分区。 */
export const getProjectSpaceAreas = cache(async (projectId: number) =>
  unwrap(await requestProjectSpaceAreas(await getAccessToken(), projectId)),
);

/** 读取新版项目空间当前私有分区的成员列表。 */
export const getProjectSpaceAreaMembers = cache(async (projectId: number, areaId: number) =>
  unwrap(await requestProjectSpaceAreaMembers(await getAccessToken(), projectId, areaId)),
);

/** 读取新版项目空间当前项目成员。 */
export const getProjectSpaceMembers = cache(async (projectId: number) =>
  unwrap(await requestProjectSpaceMembers(await getAccessToken(), projectId)),
);

/** 读取新版项目空间当前项目尚可添加的组织用户。 */
export const getProjectSpaceMemberCandidates = cache(
  async (projectId: number, query: ProjectMemberCandidateListQuery = {}) =>
    unwrap(await requestProjectSpaceMemberCandidates(await getAccessToken(), projectId, query)),
);

/** 读取新版项目空间当前项目内的决策摘要。 */
export const getProjectSpaceDecisions = cache(async (projectId: number) =>
  unwrap(await requestProjectSpaceDecisions(await getAccessToken(), projectId)),
);

/** 读取新版项目空间当前用户可见的会议摘要。 */
export const getProjectSpaceMeetings = cache(async (projectId: number) =>
  unwrap(await requestProjectSpaceMeetings(await getAccessToken(), projectId)),
);

/** 读取新版项目空间当前分区的首屏消息。 */
export const getProjectSpaceMessages = cache(
  async (projectId: number, areaId: number, query: ProjectChatMessageListQuery = {}) =>
    unwrap(
      await requestProjectSpaceMessages(await getAccessToken(), projectId, areaId, {
        direction: 'before',
        limit: 30,
        ...query,
      }),
    ),
);

/** 读取 httpOnly Cookie 中的访问令牌。 */
async function getAccessToken(): Promise<string> {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;
  if (!accessToken) throw new Error('登录状态已失效，请重新登录');
  return accessToken;
}

/** 解包 NestJS 响应并保留新版项目空间的失败上下文。 */
function unwrap<T>(response: NestResponse<T>): T {
  if (!response.body.success) {
    throw new ProjectSpaceServerError(
      response.status,
      response.body.code,
      response.body.message,
      response.body.requestId,
    );
  }
  return response.body.data;
}
