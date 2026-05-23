import { requestNest } from "@/services/bff-request"

export async function GET() {
  // 示例接口：页面仍然只访问 Next.js 同域 /api/test/users。
  const upstream = await requestNest("/test/users")

  // 这里保持代理透明，真实业务接口建议封装到对应 feature 的 bff service。
  return Response.json(upstream.body, { status: upstream.status })
}
