import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AUTH_COOKIE_NAME } from "@/features/auth/constants"

// 渲染 dashboard 首页占位内容。
export default async function Dashboard() {
  const cookieStore = await cookies()

  if (!cookieStore.has(AUTH_COOKIE_NAME)) {
    redirect("/login")
  }

  return (
    <main className="rounded-md border bg-background p-6">
      <p className="text-sm text-muted-foreground">当前路由：/dashboard</p>
    </main>
  )
}
