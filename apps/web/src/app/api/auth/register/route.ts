import { NextResponse } from "next/server"

import { requestRegisterFromNest } from "@/features/auth/services/auth-bff.service"
import type { RegisterRequestPayload } from "@/features/auth/types/auth.type"

export async function POST(request: Request) {
  try {
    const values = (await request.json()) as Partial<RegisterRequestPayload>
    const email = values.email?.trim()
    const passwordCiphertext = values.passwordCiphertext?.trim()
    const passwordKeyId = values.passwordKeyId?.trim()
    const name = values.name?.trim() ?? ""

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

    const upstream = await requestRegisterFromNest({
      email,
      passwordCiphertext,
      passwordKeyId,
      name,
    })

    return NextResponse.json(upstream.body, {
      status: upstream.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        code: 500,
        message: error instanceof Error ? error.message : "注册失败，请稍后再试",
        data: null,
        timestamp: Date.now(),
      },
      { status: 500 },
    )
  }
}
