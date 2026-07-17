import { NextResponse } from "next/server"

import { apiError, apiErrorFromUnknown } from "@/app/api/_utils/response"
import {
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
} from "@/features/auth/constants"
import { requestLoginFromNest } from "@/features/auth/services/auth-nest-client"
import type { LoginRequestPayload } from "@/features/auth/types/auth.type"

export async function POST(request: Request) {
  try {
    const values = (await request.json()) as Partial<LoginRequestPayload>
    const email = values.email?.trim()
    const passwordCiphertext = values.passwordCiphertext?.trim()
    const passwordKeyId = values.passwordKeyId?.trim()
    const nonce = values.nonce?.trim()

    // BFF 先做基础参数校验，复杂账号规则仍由 NestJS 兜底。
    if (!email || !passwordCiphertext || !passwordKeyId || !nonce) {
      return apiError({
        status: 400,
        message: "请输入有效邮箱和加密后的密码",
      })
    }

    const upstream = await requestLoginFromNest({
      email,
      passwordCiphertext,
      passwordKeyId,
      nonce,
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

      // token 只写入 httpOnly Cookie，不返回给浏览器 JS，降低 XSS 泄露风险。
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
    return apiErrorFromUnknown(error, "登录失败，请稍后再试", 401)
  }
}
