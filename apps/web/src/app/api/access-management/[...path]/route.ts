/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: 用户、角色、权限管理 BFF 代理，将 Web 请求转发到 Nest 访问控制管理接口
 * @Copyright: Copyright 1990 - 2026
 */
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { apiError, apiErrorFromUnknown } from "@/app/api/_utils/response"
import { AUTH_ACCESS_COOKIE_NAME } from "@/features/auth/constants"
import { requestNest } from "@/services/bff-request"

type RouteContext = {
  params: Promise<{
    path: string[]
  }>
}

export async function GET(_request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("GET", context)
}

export async function POST(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("POST", context, request)
}

export async function PATCH(request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("PATCH", context, request)
}

export async function DELETE(_request: Request, context: RouteContext) {
  return proxyAccessManagementRequest("DELETE", context)
}

// 统一代理用户管理相关请求，并自动带上 httpOnly access token。
async function proxyAccessManagementRequest(
  method: string,
  context: RouteContext,
  request?: Request,
) {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value

    if (!accessToken) {
      return apiError({ status: 401, message: "登录状态已失效，请重新登录" })
    }

    const { path } = await context.params
    const body = request ? await readJsonBody(request) : undefined
    const upstream = await requestNest(`/access-management/${path.join("/")}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body,
    })

    return NextResponse.json(upstream.body, {
      status: upstream.status,
    })
  } catch (error) {
    return apiErrorFromUnknown(error, "用户管理请求失败，请稍后再试")
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

