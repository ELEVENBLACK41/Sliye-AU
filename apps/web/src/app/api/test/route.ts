import { requestNest } from "@/services/bff-request"

export async function GET() {
  // 示例接口：浏览器请求 /api/test，BFF 再转发到 NestJS /test。
  const upstream = await requestNest("/test")

  return Response.json(upstream.body, { status: upstream.status })
}
