/*
 * @Description: 处理 Web 端无感刷新 token 的 BFF 接口，只通过 httpOnly Cookie 读写 token。
 */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { apiError, apiErrorFromUnknown } from '@/app/api/_utils/response';
import { AUTH_ACCESS_COOKIE_NAME, AUTH_REFRESH_COOKIE_NAME } from '@/features/auth/constants';
import { requestRefreshFromNest } from '@/features/auth/services/auth-nest-client';

// 使用 httpOnly refresh token 换新会话 token，并避免把 token 暴露给浏览器 JS。
export async function POST() {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE_NAME)?.value;

    if (!refreshToken) {
      return apiError({
        status: 401,
        message: '登录状态已失效，请重新登录',
      });
    }

    const upstream = await requestRefreshFromNest(refreshToken);
    const responseBody = upstream.body.data
      ? {
          ...upstream.body,
          data: {
            user: upstream.body.data.user,
          },
        }
      : upstream.body;
    const response = NextResponse.json(responseBody, {
      status: upstream.status,
    });

    if (upstream.status >= 200 && upstream.status < 300 && upstream.body.data) {
      const { tokens } = upstream.body.data;

      response.cookies.set({
        name: AUTH_ACCESS_COOKIE_NAME,
        value: tokens.accessToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: tokens.accessTokenExpiresIn,
      });

      response.cookies.set({
        name: AUTH_REFRESH_COOKIE_NAME,
        value: tokens.refreshToken,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: tokens.refreshTokenExpiresIn,
      });
    } else if (upstream.status === 401) {
      response.cookies.delete(AUTH_ACCESS_COOKIE_NAME);
      response.cookies.delete(AUTH_REFRESH_COOKIE_NAME);
    }

    return response;
  } catch (error) {
    return apiErrorFromUnknown(error, '登录状态刷新失败，请重新登录', 401);
  }
}
