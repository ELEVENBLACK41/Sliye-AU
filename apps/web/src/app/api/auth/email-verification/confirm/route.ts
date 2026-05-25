import { NextResponse } from "next/server"

import { apiError, apiErrorFromUnknown } from "@/app/api/_utils/response"
import {
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
} from "@/features/auth/constants"
import { requestConfirmEmailFromNest } from "@/features/auth/services/auth-bff.service"
import type { ConfirmEmailFormValues } from "@/features/auth/types/auth.type"

export async function POST(request: Request) {
  try {
    const values = (await request.json()) as Partial<ConfirmEmailFormValues>
    const email = values.email?.trim()
    const code = values.code?.trim() ?? ""

    // 验证码格式在 BFF 先拦一次，是否过期、是否匹配由 NestJS 判断。
    if (!email || !/^\d{6}$/.test(code)) {
      return apiError({
        status: 400,
        message: "请输入有效邮箱和 6 位验证码",
      })
    }

    const upstream = await requestConfirmEmailFromNest({
      email,
      code,
    })
    const responseBody = upstream.body.data
      ? {
          ...upstream.body,
          data: {
            user: upstream.body.data.user,
          },
        }
      : upstream.body
    const response = NextResponse.json(responseBody, {
      status: upstream.status,
    })

    if (upstream.status >= 200 && upstream.status < 300 && upstream.body.data) {
      const { tokens } = upstream.body.data

      // 邮箱验证成功等同完成登录，同样只把 token 放进 httpOnly Cookie。
      response.cookies.set({
        name: AUTH_ACCESS_COOKIE_NAME,
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
    }

    return response
  } catch (error) {
    return apiErrorFromUnknown(error, "验证失败，请稍后再试", 500)
  }
}
