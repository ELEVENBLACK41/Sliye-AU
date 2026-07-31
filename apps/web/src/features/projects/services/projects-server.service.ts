/**
 * 本文件封装项目页面的 Next.js 服务端数据读取与结构化错误。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ApiErrorCode } from '@workspace/contracts/common';
import type { ProjectChatMessageListQuery, ProjectMemberCandidateListQuery } from '@workspace/contracts/projects';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import {
  requestProjectAreasFromNest,
  requestAreaMembersFromNest,
  requestProjectDecisionsFromNest,
  requestProjectDetailFromNest,
  requestProjectMeetingsFromNest,
  requestProjectMemberCandidatesFromNest,
  requestProjectMembersFromNest,
  requestProjectMessagesFromNest,
  requestProjectsFromNest,
} from './projects-nest-client';

/** 项目 Server Component 数据读取失败时抛出的结构化异常。 */
export class ProjectServerError extends Error {
  /** NestJS 返回的 HTTP 状态码。 */
  readonly status: number;
  /** 前后端共享的业务错误码。 */
  readonly code: ApiErrorCode;
  /** 请求链路编号。 */
  readonly requestId: string;

  /** 从上游失败响应构造页面异常。 */
  constructor(status: number, code: ApiErrorCode, message: string, requestId: string) {
    super(message);
    this.name = 'ProjectServerError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 读取项目列表。 */
export const getProjects = cache(async () => unwrap(await requestProjectsFromNest(await getAccessToken())));

/** 读取单项项目详情。 */
export const getProject = cache(async (projectId: number) =>
  unwrap(await requestProjectDetailFromNest(await getAccessToken(), projectId)),
);

/** 读取项目的可见分区。 */
export const getProjectAreas = cache(async (projectId: number) =>
  unwrap(await requestProjectAreasFromNest(await getAccessToken(), projectId)),
);

/** 读取项目成员。 */
export const getProjectMembers = cache(async (projectId: number) =>
  unwrap(await requestProjectMembersFromNest(await getAccessToken(), projectId)),
);

/** 读取尚未加入当前项目的可用用户候选。 */
export const getProjectMemberCandidates = cache(async (projectId: number, query: ProjectMemberCandidateListQuery = {}) =>
  unwrap(await requestProjectMemberCandidatesFromNest(await getAccessToken(), projectId, query)),
);

/** 读取私有分区的显式成员。 */
export const getAreaMembers = cache(async (projectId: number, areaId: number) =>
  unwrap(await requestAreaMembersFromNest(await getAccessToken(), projectId, areaId)),
);

/** 读取项目内的决策。 */
export const getProjectDecisions = cache(async (projectId: number) =>
  unwrap(await requestProjectDecisionsFromNest(await getAccessToken(), projectId)),
);

/** 读取项目内当前可见会议。 */
export const getProjectMeetings = cache(async (projectId: number) =>
  unwrap(await requestProjectMeetingsFromNest(await getAccessToken(), projectId)),
);

/** 读取当前分区首屏消息。 */
export const getProjectMessages = cache(
  async (projectId: number, areaId: number, query: ProjectChatMessageListQuery = {}) =>
    unwrap(
      await requestProjectMessagesFromNest(await getAccessToken(), projectId, areaId, {
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
    throw new ProjectServerError(response.status, response.body.code, response.body.message, response.body.requestId);
  }
  return response.body.data;
}
