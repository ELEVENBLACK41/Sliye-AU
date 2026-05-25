import type { Metadata } from "next"

import { LoginPage } from "@/features/auth"

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[]
  }>
}

export const metadata: Metadata = {
  title: "登录 | Decision Hub",
  description: "Decision Hub 登录",
}

export default async function Page({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const nextValue = Array.isArray(params.next) ? params.next[0] : params.next

  return <LoginPage redirectTo={getSafeRedirectPath(nextValue)} />
}

function getSafeRedirectPath(path?: string) {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return undefined
  }

  return path === "/login" ? undefined : path
}
