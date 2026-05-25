import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import {
  AUTH_COOKIE_NAME,
  LOGIN_REDIRECT_PATH,
} from "@/features/auth/constants"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasSession = request.cookies.has(AUTH_COOKIE_NAME)

  if (pathname.startsWith("/dashboard") && !hasSession) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)

    return NextResponse.redirect(loginUrl)
  }

  if (pathname === "/login" && hasSession) {
    return NextResponse.redirect(new URL(LOGIN_REDIRECT_PATH, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
}
