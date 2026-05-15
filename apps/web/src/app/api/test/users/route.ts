/*
 * @Author: shaoliye
 * @Date: 2026-05-06 00:00:00
 * @Description: BFF 代理路由 — 转发到 NestJS GET /test/users
 * @Copyright: Copyright 1990 - 2026
 */

export async function GET() {
  const res = await fetch(`${process.env.NEST_BASE_URL}/test/users`)

  if (!res.ok) {
    return Response.json(
      { code: res.status, message: 'Upstream error', data: null, timestamp: Date.now() },
      { status: res.status },
    )
  }

  const data = await res.json()
  return Response.json(data)
}
