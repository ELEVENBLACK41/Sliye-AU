import { NextResponse } from "next/server"

import { requestPasswordPublicKeyFromNest } from "@/features/auth/services/auth-nest-client"

export async function GET() {
  // 浏览器只拿公钥加密密码，私钥永远留在 NestJS 服务端。
  const upstream = await requestPasswordPublicKeyFromNest()

  return NextResponse.json(upstream.body, {
    status: upstream.status,
  })
}
