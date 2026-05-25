import { NextResponse } from "next/server"

import { apiError, apiErrorFromUnknown } from "@/app/api/_utils/response"
import { requestRegisterFromNest } from "@/features/auth/services/auth-bff.service"
import type { RegisterRequestPayload } from "@/features/auth/types/auth.type"

export async function POST(request: Request) {
  try {
    const values = (await request.json()) as Partial<RegisterRequestPayload>
    const email = values.email?.trim()
    const passwordCiphertext = values.passwordCiphertext?.trim()
    const passwordKeyId = values.passwordKeyId?.trim()
    const nonce = values.nonce?.trim()
    const name = values.name?.trim() ?? ""

    // 这里只挡明显缺参，密码强度、邮箱唯一性等业务规则交给 NestJS。
    if (!email || !passwordCiphertext || !passwordKeyId || !nonce) {
      return apiError({
        status: 400,
        message: "请输入有效邮箱和加密后的密码",
      })
    }

    const upstream = await requestRegisterFromNest({
      email,
      passwordCiphertext,
      passwordKeyId,
      nonce,
      name,
    })

    return NextResponse.json(upstream.body, {
      status: upstream.status,
    })
  } catch (error) {
    return apiErrorFromUnknown(error, "注册失败，请稍后再试", 500)
  }
}
