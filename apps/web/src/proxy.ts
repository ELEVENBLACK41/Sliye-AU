/**
 * 本文件在 Next.js 请求入口执行粗粒度会话保护和 Cookie 续签。
 * 业务权限不在这里判断，仍由 Server Component 与 NestJS 后端完成。
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { AuthSession } from '@workspace/contracts/auth';
import type { ApiResponse } from '@workspace/contracts/common';

import { AUTH_COOKIE_NAME, AUTH_REFRESH_COOKIE_NAME, LOGIN_REDIRECT_PATH } from '@/features/auth/constants';

/** Proxy 直接调用 NestJS 刷新接口时使用的统一响应类型。 */
type RefreshResponseBody = ApiResponse<AuthSession>;

/** 提前刷新 access token 的安全缓冲时间，避免渲染过程中刚好过期。 */
const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 15_000;

/** 保护登录后的一级业务路由，并在 access Cookie 缺失、损坏或即将过期时提前轮换会话。 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const needsRefresh = !accessToken || isAccessTokenExpired(accessToken);
  const hasRefreshToken = request.cookies.has(AUTH_REFRESH_COOKIE_NAME);
  const isProtectedPath =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/decisions');

  if (isProtectedPath && needsRefresh && hasRefreshToken) {
    // 刷新后的 Cookie 要在下一次请求中被 Server Component 读取，因此主动回跳一次原地址。
    const refreshedResponse = await refreshSessionFromProxy(request, NextResponse.redirect(request.nextUrl));

    if (refreshedResponse) {
      return refreshedResponse;
    }
  }

  if (isProtectedPath && needsRefresh) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(loginUrl);

    response.cookies.delete(AUTH_COOKIE_NAME);
    response.cookies.delete(AUTH_REFRESH_COOKIE_NAME);

    return response;
  }

  if (pathname === '/login' && !needsRefresh) {
    return NextResponse.redirect(new URL(LOGIN_REDIRECT_PATH, request.url));
  }

  if (pathname === '/login' && hasRefreshToken) {
    const refreshedResponse = await refreshSessionFromProxy(
      request,
      NextResponse.redirect(new URL(LOGIN_REDIRECT_PATH, request.url)),
    );

    if (refreshedResponse) {
      return refreshedResponse;
    }

    const response = NextResponse.next();

    response.cookies.delete(AUTH_COOKIE_NAME);
    response.cookies.delete(AUTH_REFRESH_COOKIE_NAME);

    return response;
  }

  return NextResponse.next();
}

/** Next.js Proxy 只拦截登录页和当前已上线的受保护业务路由。 */
export const config = {
  matcher: ['/login', '/dashboard/:path*', '/projects/:path*', '/decisions/:path*'],
};

/** 在 Proxy 阶段请求 NestJS refresh，保证进入 Server Component 前 Cookie 已续签。 */
async function refreshSessionFromProxy(request: NextRequest, response: NextResponse) {
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE_NAME)?.value;
  const baseUrl = getNestBaseUrl();

  if (!refreshToken || !baseUrl) {
    return null;
  }

  try {
    const upstream = await fetch(`${baseUrl}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return null;
    }

    const body = (await upstream.json()) as RefreshResponseBody;

    if (!body.success) {
      return null;
    }

    const { tokens } = body.data;

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
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

    return response;
  } catch {
    return null;
  }
}

/**
 * 判断 access token 是否已经过期或即将过期。
 *
 * 这里仅为决定是否尝试 refresh，绝不把未经验证的 JWT 载荷作为身份或权限依据；
 * 最终令牌验证仍完全由 NestJS 的 AccessTokenGuard 执行。
 */
function isAccessTokenExpired(accessToken: string): boolean {
  const payloadSegment = accessToken.split('.')[1];

  if (!payloadSegment) {
    return true;
  }

  try {
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(paddedBase64)) as { exp?: unknown };

    return (
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      payload.exp * 1_000 <= Date.now() + ACCESS_TOKEN_REFRESH_LEEWAY_MS
    );
  } catch {
    return true;
  }
}

/** 读取服务端 NestJS 地址，并补全默认 `api/v1` 前缀。 */
function getNestBaseUrl() {
  const baseUrl = process.env.NEST_BASE_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    return undefined;
  }

  const apiPrefix = (process.env.NEST_API_PREFIX ?? 'api/v1').replace(/^\/+|\/+$/g, '');

  if (!apiPrefix || baseUrl.endsWith(`/${apiPrefix}`)) {
    return baseUrl;
  }

  return `${baseUrl}/${apiPrefix}`;
}
