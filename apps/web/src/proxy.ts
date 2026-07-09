import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  AUTH_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
  LOGIN_REDIRECT_PATH,
} from "@/features/auth/constants"

type RefreshResponseBody = {
  code: number
  data: {
    tokens: {
      accessToken: string
      accessTokenExpiresIn: number
      refreshToken: string
      refreshTokenExpiresIn: number
    }
  } | null
}

// 保护 dashboard 路由，并在 access cookie 消失但 refresh cookie 仍有效时提前续签。
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(AUTH_COOKIE_NAME)
  const hasRefreshToken = request.cookies.has(AUTH_REFRESH_COOKIE_NAME)

  if (pathname.startsWith("/dashboard") && !hasSession && hasRefreshToken) {
    const refreshedResponse = await refreshSessionFromProxy(
      request,
      NextResponse.next(),
    )

    if (refreshedResponse) {
      return refreshedResponse
    }
  }

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    const response = NextResponse.redirect(loginUrl)

    response.cookies.delete(AUTH_COOKIE_NAME)
    response.cookies.delete(AUTH_REFRESH_COOKIE_NAME)

    return response
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL(LOGIN_REDIRECT_PATH, request.url))
  }

  if (pathname === "/login" && hasRefreshToken) {
    const refreshedResponse = await refreshSessionFromProxy(
      request,
      NextResponse.redirect(new URL(LOGIN_REDIRECT_PATH, request.url)),
    )

    if (refreshedResponse) {
      return refreshedResponse
    }

    const response = NextResponse.next()

    response.cookies.delete(AUTH_COOKIE_NAME)
    response.cookies.delete(AUTH_REFRESH_COOKIE_NAME)

    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
}

// 在 proxy 阶段直接请求 Nest refresh，保证进入 Server Component 前 cookie 已经续上。
async function refreshSessionFromProxy(
  request: NextRequest,
  response: NextResponse,
) {
  const refreshToken = request.cookies.get(AUTH_REFRESH_COOKIE_NAME)?.value
  const baseUrl = getNestBaseUrl()

  if (!refreshToken || !baseUrl) {
    return null
  }

  try {
    const upstream = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    })

    if (!upstream.ok) {
      return null
    }

    const body = (await upstream.json()) as RefreshResponseBody
    const tokens = body.data?.tokens

    if (body.code !== 200 || !tokens) {
      return null
    }

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: tokens.accessToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: tokens.accessTokenExpiresIn,
    })

    response.cookies.set({
      name: AUTH_REFRESH_COOKIE_NAME,
      value: tokens.refreshToken,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: tokens.refreshTokenExpiresIn,
    })

    return response
  } catch {
    return null
  }
}

// 读取 Nest API 地址，并补全默认的 api/v1 前缀。
function getNestBaseUrl() {
  const baseUrl = process.env.NEST_BASE_URL?.replace(/\/+$/, "")

  if (!baseUrl) {
    return undefined
  }

  const apiPrefix = (process.env.NEST_API_PREFIX ?? "api/v1").replace(
    /^\/+|\/+$/g,
    "",
  )

  if (!apiPrefix || baseUrl.endsWith(`/${apiPrefix}`)) {
    return baseUrl
  }

  return `${baseUrl}/${apiPrefix}`
}
