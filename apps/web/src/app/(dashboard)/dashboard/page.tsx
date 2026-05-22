import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { CheckCircle2 } from "lucide-react"

import { LogoutButton } from "@/features/auth/components/logout-button"
import { AUTH_COOKIE_NAME } from "@/features/auth/constants"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default async function Dashboard() {
  const cookieStore = await cookies()

  if (!cookieStore.has(AUTH_COOKIE_NAME)) {
    redirect("/login")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-8">
      <Card className="w-full max-w-xl rounded-md shadow-none">
        <CardHeader className="space-y-3">
          <Badge variant="outline" className="w-fit">
            已登录
          </Badge>
          <div className="flex items-start gap-3">
            <div className="mt-1 flex size-10 items-center justify-center rounded-md bg-emerald-600 text-white">
              <CheckCircle2 className="size-5" aria-hidden />
            </div>
            <div>
              <CardTitle className="text-2xl">登录成功</CardTitle>
              <CardDescription className="mt-2">
                这里会继续承载决策列表、决策详情和协作流程。
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            当前先完成认证闭环，后续再接入 Decision 主链路。
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  )
}
