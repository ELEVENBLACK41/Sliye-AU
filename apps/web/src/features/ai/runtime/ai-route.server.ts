/**
 * 本文件集中处理 AI BFF Route 的登录态、系统权限和 NestJS 稳定错误映射。
 */
import 'server-only';

import { NextResponse } from 'next/server';
import { SYSTEM_PERMISSIONS } from '@workspace/contracts/access';

import { apiError } from '@/app/api/_utils/response';
import { hasSystemPermission } from '@/features/auth/services/auth-server.service';
import { getAuthenticatedRouteSession } from '@/server/bff/authenticated-nest-proxy';

import { AiNestRequestError, type AiNestIdentity } from './ai-nest-client.server';

/** AI Route 认证成功或可直接返回的失败响应。 */
export type AiRouteAuthentication = { ok: true; identity: AiNestIdentity } | { ok: false; response: Response };

/** 校验登录态与 ai:chat:use，并只返回服务端运行身份。 */
export async function authenticateAiRoute(path: string): Promise<AiRouteAuthentication> {
  const session = await getAuthenticatedRouteSession();

  if (!session) {
    return {
      ok: false,
      response: apiError({
        status: 401,
        message: '登录状态已失效，请重新登录',
        path,
      }),
    };
  }

  if (!hasSystemPermission(session.user, SYSTEM_PERMISSIONS.ai.chatUse)) {
    return {
      ok: false,
      response: apiError({
        status: 403,
        message: '当前账号没有使用 AI 对话的权限',
        path,
      }),
    };
  }

  return {
    ok: true,
    identity: { userId: session.user.id, accessToken: session.accessToken },
  };
}

/** 将 NestJS 稳定错误原样映射，未知错误只返回脱敏兜底文案。 */
export function handleAiRouteError(error: unknown, path: string, fallbackMessage: string): Response {
  if (error instanceof AiNestRequestError) {
    return NextResponse.json(error.response, { status: error.status });
  }

  return apiError({ status: 500, message: fallbackMessage, path });
}
