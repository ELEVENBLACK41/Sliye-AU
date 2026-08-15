/**
 * 本文件负责关系图谱页面的 Next.js 服务端快照读取与结构化错误转换。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import type { ApiErrorCode } from '@workspace/contracts/common';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import { requestRelationshipGraphFromNest } from './relationship-graph-nest-client';

/** 关系图谱服务端读取失败时保留的结构化业务异常。 */
export class RelationshipGraphServerError extends Error {
  /** NestJS 返回的 HTTP 状态码。 */
  readonly status: number;
  /** 前后端共享的业务错误码。 */
  readonly code: ApiErrorCode;
  /** 贯穿请求链路的请求编号。 */
  readonly requestId: string;

  /** 从上游失败响应构造关系图谱异常。 */
  constructor(status: number, code: ApiErrorCode, message: string, requestId: string) {
    super(message);
    this.name = 'RelationshipGraphServerError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

/** 读取当前用户可见的完整关系图谱快照。 */
export const getRelationshipGraph = cache(async () =>
  unwrap(await requestRelationshipGraphFromNest(await getAccessToken())),
);

/** 从 httpOnly Cookie 读取访问令牌。 */
async function getAccessToken(): Promise<string> {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;

  if (!accessToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  return accessToken;
}

/** 解包 NestJS 统一响应，并保留上游错误上下文。 */
function unwrap<T>(response: NestResponse<T>): T {
  if (!response.body.success) {
    throw new RelationshipGraphServerError(
      response.status,
      response.body.code,
      response.body.message,
      response.body.requestId,
    );
  }

  return response.body.data;
}
