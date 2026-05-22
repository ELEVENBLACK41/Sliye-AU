"use client"

import { useState } from "react"
import { Loader2, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

import type { OperationResult } from "@/features/auth/types/auth.type"
import { requestData } from "@/services/request"
import { Button } from "@workspace/ui/components/button"

export function LogoutButton() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleLogout() {
    if (isPending) {
      return
    }

    setIsPending(true)

    try {
      await requestData<OperationResult>("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        errorMessage: "退出登录失败，请稍后再试",
      })
      router.replace("/login")
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleLogout}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <LogOut className="size-4" aria-hidden />
      )}
      退出
    </Button>
  )
}
