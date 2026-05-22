import { NextResponse } from "next/server"

import { requestPasswordPublicKeyFromNest } from "@/features/auth/services/auth-bff.service"

export async function GET() {
  const upstream = await requestPasswordPublicKeyFromNest()

  return NextResponse.json(upstream.body, {
    status: upstream.status,
  })
}
