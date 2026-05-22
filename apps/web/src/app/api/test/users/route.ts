/*
 * @Author: shaoliye
 * @Date: 2026-05-06 00:00:00
 * @Description: BFF 代理路由，转发到 NestJS GET /test/users
 * @Copyright: Copyright 1990 - 2026
 */
import { upstreamError } from "@/app/api/_utils/response"

export async function GET() {
  // 示例接口：页面仍然只访问 Next.js 同域 /api/test/users。
  const res = await fetch(`${process.env.NEST_BASE_URL}/test/users`)

  if (!res.ok) {
    return upstreamError(res.status)
  }

  // 这里保持代理透明，真实业务接口建议封装到对应 feature 的 bff service。
  const data = await res.json()
  return Response.json(data)
}
