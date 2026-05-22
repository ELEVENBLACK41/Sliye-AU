import { NextResponse } from "next/server"

import { requestSendEmailVerificationFromNest } from "@/features/auth/services/auth-bff.service"
import type { SendEmailVerificationFormValues } from "@/features/auth/types/auth.type"

export async function POST(request: Request) {
  try {
    const values =
      (await request.json()) as Partial<SendEmailVerificationFormValues>
    const email = values.email?.trim()

    if (!email) {
      return NextResponse.json(
        {
          code: 400,
          message: "请输入有效邮箱",
          data: null,
          timestamp: Date.now(),
        },
        { status: 400 },
      )
    }

    const upstream = await requestSendEmailVerificationFromNest({ email })

    return NextResponse.json(upstream.body, {
      status: upstream.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message:
          error instanceof Error ? error.message : "发送验证码失败，请稍后再试",
        data: null,
        timestamp: Date.now(),
      },
      { status: 500 },
    )
  }
}
