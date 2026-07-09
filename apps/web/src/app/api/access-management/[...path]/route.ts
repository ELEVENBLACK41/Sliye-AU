/*
 * @Description: 用户、角色、权限管理的 BFF 代理，负责给 Nest 受保护接口补充认证信息。
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { apiError, apiErrorFromUnknown } from "@/app/api/_utils/response"
import {
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
} from "@/features/auth/constants"
import { requestRefreshFromNest } from "@/features/auth/services/auth-bff.service"
import { requestNest } from "@/services/bff-request"

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

// 代理用户管理 GET 请求。
export async function GET(_request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("GET", context)
}

// 代理用户管理 POST 请求。
export async function POST(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("POST", context, request)
}

// 代理用户管理 PATCH 请求。
export async function PATCH(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("PATCH", context, request)
}

// 代理用户管理 DELETE 请求。
export async function DELETE(_request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("DELETE", context)
}

// 统一代理用户管理相关请求，access 过期时用 refresh token 重试一次。
async function proxyAccessManagementRequest(
  method: string,
  context: RouteContext,
  request?: Request,
) {
  try {
    const cookieStore = await cookies()
    let accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value

    if (!accessToken) {
      const refreshResult = await refreshAccessTokenFromCookie()
      accessToken = refreshResult?.accessToken
    }

    if (!accessToken) {
      return apiError({ status: 401, message: "登录状态已失效，请重新登录" })
    }

    const { path } = await context.params
    const body = request ? await readJsonBody(request) : undefined
    let upstream = await requestNest(`/access-management/${path.join("/")}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    })

    if (upstream.status === 401) {
      const refreshResult = await refreshAccessTokenFromCookie()

      if (refreshResult) {
        accessToken = refreshResult.accessToken
        upstream = await requestNest(`/access-management/${path.join("/")}`, {
          method,
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          body,
        })
      }
    }

    const response = NextResponse.json(upstream.body, {
      status: upstream.status,
    })

    if (upstream.status === 401) {
      response.cookies.delete(AUTH_ACCESS_COOKIE_NAME)
      response.cookies.delete(AUTH_REFRESH_COOKIE_NAME)
    }

    return response
  } catch (error) {
    return apiErrorFromUnknown(
      error,
      "用户管理请求失败，请稍后再试",
    )
  }
}

// 读取可选 JSON 请求体，空请求体保持 undefined。
async function readJsonBody(request: Request) {
  const text = await request.text()

  if (!text) {
    return undefined
  }

  return JSON.parse(text) as unknown
}

// 从 refresh cookie 换新 token，并写回 Route Handler 的 Cookie 存储。
async function refreshAccessTokenFromCookie() {
  const cookieStore = await cookies()
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE_NAME)?.value

  if (!refreshToken) {
    return null
  }

  const upstream = await requestRefreshFromNest(refreshToken)

  if (upstream.status < 200 || upstream.status >= 300 || !upstream.body.data) {
    return null
  }

  const { tokens } = upstream.body.data

  cookieStore.set({
    name: AUTH_ACCESS_COOKIE_NAME,
    value: tokens.accessToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: tokens.accessTokenExpiresIn,
  })

  cookieStore.set({
    name: AUTH_REFRESH_COOKIE_NAME,
    value: tokens.refreshToken,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: tokens.refreshTokenExpiresIn,
  })

  return {
    accessToken: tokens.accessToken,
  }
}
