import { NextResponse } from "next/server"
import { cookies } from "next/headers"

import {
  AUTH_ACCESS_COOKIE_NAME,
  AUTH_REFRESH_COOKIE_NAME,
} from "@/features/auth/constants"
import { requestLogoutFromNest } from "@/features/auth/services/auth-bff.service"

export async function POST() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value
  const upstream = accessToken
    ? await requestLogoutFromNest(accessToken)
    : {
        status: 200,
        body: {
          code: 0,
          message: "success",
          data: { success: true },
          timestamp: Date.now(),
        },
      }
  const response = NextResponse.json(upstream.body, {
    status: upstream.status,
  })

  response.cookies.delete(AUTH_ACCESS_COOKIE_NAME)
  response.cookies.delete(AUTH_REFRESH_COOKIE_NAME)

  return response
}
