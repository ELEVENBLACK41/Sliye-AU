import { NextResponse } from "next/server"

import {
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
} from "@/features/auth/constants"
import { requestLoginFromNest } from "@/features/auth/services/auth-bff.service"
import type { LoginRequestPayload } from "@/features/auth/types/auth.type"

export async function POST(request: Request) {
  try {
    const values = (await request.json()) as Partial<LoginRequestPayload>
    const email = values.email?.trim()
    const passwordCiphertext = values.passwordCiphertext?.trim()
    const passwordKeyId = values.passwordKeyId?.trim()

    if (!email || !passwordCiphertext || !passwordKeyId) {
      return NextResponse.json(
        {
          code: 400,
          message: "请输入有效邮箱和加密后的密码",
          data: null,
          timestamp: Date.now(),
        },
        { status: 400 },
      )
    }

    const upstream = await requestLoginFromNest({
      email,
      passwordCiphertext,
      passwordKeyId,
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
    return NextResponse.json(
      {
        code: 401,
        message: error instanceof Error ? error.message : "登录失败，请稍后再试",
        data: null,
        timestamp: Date.now(),
      },
      { status: 401 },
    )
  }
}
