/**
 * 本文件提供跨业务复用的 NestJS 认证代理、服务端单次刷新和统一 Cookie 轮换能力。
 */
import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { AuthSession, AuthUser } from '@workspace/contracts/auth';

import { apiError, apiErrorFromUnknown } from '@/app/api/_utils/response';
import { AUTH_ACCESS_COOKIE_NAME, AUTH_REFRESH_COOKIE_NAME } from '@/features/auth/constants';
import { requestProfileFromNest, requestRefreshFromNest } from '@/features/auth/services/auth-nest-client';
import { requestNest, requestNestRaw, type NestResponse } from '@/services/bff-request';

/** 同一服务进程内按刷新令牌合并的进行中刷新请求。 */
const refreshFlights = new Map<string, Promise<NestResponse<AuthSession>>>();

/** 受保护 BFF 请求支持的 HTTP 方法。 */
type ProxyHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** 受保护 BFF 转发函数参数。 */
type AuthenticatedProxyOptions = {
  /** 浏览器发来的原始请求。 */
  request: Request;
  /** NestJS API 前缀后的目标路径。 */
  nestPath: string;
  /** 需要转发的 HTTP 方法。 */
  method: ProxyHttpMethod;
  /** 发生未知异常时展示的中文兜底文案。 */
  fallbackMessage: string;
};

/**
 * 转发一条受保护的 BFF 请求。
 *
 * access token 缺失或过期时会使用 refresh token 轮换一次；相同刷新令牌的并发请求
 * 共享同一个上游刷新 Promise，避免 refresh token 旋转产生竞态。
 */
export async function proxyAuthenticatedNestRequest({
  request,
  nestPath,
  method,
  fallbackMessage,
}: AuthenticatedProxyOptions) {
  try {
    const cookieStore = await cookies();
    let accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;

    if (!accessToken) {
      accessToken = await refreshAccessTokenFromCookie();
    }

    if (!accessToken) {
      return apiError({
        status: 401,
        message: '登录状态已失效，请重新登录',
        path: new URL(request.url).pathname,
      });
    }

    const body = method === 'GET' || method === 'DELETE' ? undefined : await readProxyBody(request);
    const query = new URL(request.url).search;
    let upstream = await requestUpstream(nestPath + query, method, accessToken, body);

    if (upstream.status === 401) {
      const refreshedAccessToken = await refreshAccessTokenFromCookie();

      if (refreshedAccessToken) {
        accessToken = refreshedAccessToken;
        upstream = await requestUpstream(nestPath + query, method, accessToken, body);
      }
    }

    const response = NextResponse.json(upstream.body, { status: upstream.status });

    if (upstream.status === 401) {
      response.cookies.delete(AUTH_ACCESS_COOKIE_NAME);
      response.cookies.delete(AUTH_REFRESH_COOKIE_NAME);
    }

    return response;
  } catch (error) {
    return apiErrorFromUnknown(error, fallbackMessage, 500, new URL(request.url).pathname);
  }
}

/** 把需要登录态的 NestJS 图片资源安全转发给浏览器。 */
export async function proxyAuthenticatedNestAssetRequest(request: Request, nestPath: string, fallbackMessage: string) {
  try {
    const cookieStore = await cookies();
    let accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;

    if (!accessToken) {
      accessToken = await refreshAccessTokenFromCookie();
    }

    if (!accessToken) {
      return apiError({
        status: 401,
        message: '登录状态已失效，请重新登录',
        path: new URL(request.url).pathname,
      });
    }

    let upstream = await requestNestRaw(nestPath, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (upstream.status === 401) {
      const refreshedAccessToken = await refreshAccessTokenFromCookie();

      if (refreshedAccessToken) {
        accessToken = refreshedAccessToken;
        upstream = await requestNestRaw(nestPath, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    }

    if (!upstream.ok) {
      const body = await readUnknownJson(upstream);
      const response = body
        ? NextResponse.json(body, { status: upstream.status })
        : apiError({
            status: upstream.status,
            message: fallbackMessage,
            path: new URL(request.url).pathname,
          });

      if (upstream.status === 401) {
        response.cookies.delete(AUTH_ACCESS_COOKIE_NAME);
        response.cookies.delete(AUTH_REFRESH_COOKIE_NAME);
      }

      return response;
    }

    const contentType = upstream.headers.get('content-type');

    if (!contentType?.startsWith('image/')) {
      return apiError({
        status: 502,
        message: '头像资源响应格式异常，请稍后再试',
        path: new URL(request.url).pathname,
      });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': upstream.headers.get('cache-control') ?? 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return apiErrorFromUnknown(error, fallbackMessage, 500, new URL(request.url).pathname);
  }
}

/**
 * 为无法直接透传到 NestJS 的 Route Handler 读取最新认证用户。
 *
 * 该函数与普通 BFF 转发共用 refresh single-flight，适合 AI 流式接口等需要先在
 * Next.js 内部执行权限判断的场景。
 */
export async function getAuthenticatedRouteUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;

  if (!accessToken) {
    accessToken = await refreshAccessTokenFromCookie();
  }

  if (!accessToken) {
    return null;
  }

  let profile = await requestProfileFromNest(accessToken);

  if (profile.status === 401) {
    const refreshedAccessToken = await refreshAccessTokenFromCookie();

    if (refreshedAccessToken) {
      profile = await requestProfileFromNest(refreshedAccessToken);
    }
  }

  return profile.body.success ? profile.body.data : null;
}

/** 向 NestJS 发出携带 Bearer token 的业务请求。 */
async function requestUpstream(path: string, method: ProxyHttpMethod, accessToken: string, body?: unknown) {
  return requestNest<unknown>(path, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
}

/** 安全读取可选 JSON 请求体，空请求体保持为 `undefined`。 */
async function readProxyBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
    return request.formData();
  }

  const text = await request.text();

  return text ? (JSON.parse(text) as unknown) : undefined;
}

/** 尝试读取上游统一错误响应，非 JSON 响应返回空。 */
async function readUnknownJson(response: Response): Promise<unknown | null> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/** 使用 httpOnly refresh Cookie 获取新 access token，并把轮换后的令牌写回响应 Cookie。 */
async function refreshAccessTokenFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE_NAME)?.value;

  if (!refreshToken) {
    return undefined;
  }

  const upstream = await refreshOnce(refreshToken);

  if (!upstream.body.success) {
    return undefined;
  }

  const { tokens } = upstream.body.data;
  cookieStore.set({
    name: AUTH_ACCESS_COOKIE_NAME,
    value: tokens.accessToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: tokens.accessTokenExpiresIn,
  });
  cookieStore.set({
    name: AUTH_REFRESH_COOKIE_NAME,
    value: tokens.refreshToken,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: tokens.refreshTokenExpiresIn,
  });

  return tokens.accessToken;
}

/** 合并同一个 refresh token 的并发轮换请求，并在结束后清理内存状态。 */
function refreshOnce(refreshToken: string): Promise<NestResponse<AuthSession>> {
  const existing = refreshFlights.get(refreshToken);

  if (existing) {
    return existing;
  }

  const flight = requestRefreshFromNest(refreshToken).finally(() => {
    refreshFlights.delete(refreshToken);
  });
  refreshFlights.set(refreshToken, flight);

  return flight;
}
