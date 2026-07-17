/**
 * 本文件处理 Web 端退出登录，并确保本地认证 Cookie 无条件清理。
 */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { apiSuccess } from '@/app/api/_utils/response';
import { AUTH_ACCESS_COOKIE_NAME, AUTH_REFRESH_COOKIE_NAME } from '@/features/auth/constants';
import { requestLogoutFromNest } from '@/features/auth/services/auth-nest-client';

/** 撤销服务端会话并清理浏览器访问令牌与刷新令牌。 */
export async function POST() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;
  const response = accessToken
    ? await createUpstreamLogoutResponse(accessToken)
    : apiSuccess({ data: { success: true }, message: '已退出登录' });

  // 不管 Nest 注销是否有 token，都清掉浏览器 Cookie，保证本机状态退出。
  response.cookies.delete(AUTH_ACCESS_COOKIE_NAME);
  response.cookies.delete(AUTH_REFRESH_COOKIE_NAME);

  return response;
}

/** 把 NestJS 注销接口的统一响应与 HTTP 状态原样转交给浏览器。 */
async function createUpstreamLogoutResponse(accessToken: string) {
  const upstream = await requestLogoutFromNest(accessToken);

  return NextResponse.json(upstream.body, { status: upstream.status });
}
