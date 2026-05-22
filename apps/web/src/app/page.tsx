import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  AUTH_COOKIE_NAME,
  LOGIN_REDIRECT_PATH,
} from "@/features/auth/constants"

export default async function Home() {
  const cookieStore = await cookies()
  const targetPath = cookieStore.has(AUTH_COOKIE_NAME)
    ? LOGIN_REDIRECT_PATH
    : "/login"

  redirect(targetPath)
}
