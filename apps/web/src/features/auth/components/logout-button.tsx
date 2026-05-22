"use client"

import { useState } from "react"
import { Loader2, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
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
