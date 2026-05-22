import { NextResponse } from "next/server"

import { apiError, apiErrorFromUnknown } from "@/app/api/_utils/response"
import { requestSendEmailVerificationFromNest } from "@/features/auth/services/auth-bff.service"
import type { SendEmailVerificationFormValues } from "@/features/auth/types/auth.type"

export async function POST(request: Request) {
  try {
    const values =
      (await request.json()) as Partial<SendEmailVerificationFormValues>
    const email = values.email?.trim()

    // BFF 做最小校验，发送频率、验证码生成和过期时间由 NestJS 控制。
    if (!email) {
      return apiError({
        status: 400,
        message: "请输入有效邮箱",
      })
    }

    const upstream = await requestSendEmailVerificationFromNest({ email })

    return NextResponse.json(upstream.body, {
      status: upstream.status,
    })
  } catch (error) {
    return apiErrorFromUnknown(error, "发送验证码失败，请稍后再试", 500)
  }
}
