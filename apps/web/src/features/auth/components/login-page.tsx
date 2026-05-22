import { LoginForm } from "@/features/auth/components/login-form"

type LoginPageProps = {
  redirectTo?: string
}

export function LoginPage({ redirectTo }: LoginPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-8 text-foreground">
      <section className="flex w-full max-w-md flex-col gap-6">
        <div className="space-y-2 text-center">
          <p className="text-sm font-medium text-emerald-700">Decision Hub</p>
          <h1 className="text-3xl font-semibold tracking-normal text-zinc-950">
            登录
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            进入决策协作系统，继续推进团队关键决策。
          </p>
        </div>
          <LoginForm redirectTo={redirectTo} />
      </section>
    </main>
  )
}
