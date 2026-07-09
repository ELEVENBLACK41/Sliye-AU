/*
 * @Author: shaoliye
 * @Date: 2026-06-20
 * @Description: Web 服务端认证资料读取服务，用于布局和页面做权限判断
 * @Copyright: Copyright 1990 - 2026
 */
import { cookies } from "next/headers"

import { AUTH_ACCESS_COOKIE_NAME } from "@/features/auth/constants"
import { requestProfileFromNest } from "./auth-bff.service"

// 在 Server Component 中读取当前登录用户资料。
export async function getCurrentAuthUser() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value

  if (!accessToken) {
    return null
  }

  const response = await requestProfileFromNest(accessToken)

  if (
    response.status < 200 ||
    response.status >= 300 ||
    response.body.code !== 200
  ) {
    return null
  }

  return response.body.data
}
