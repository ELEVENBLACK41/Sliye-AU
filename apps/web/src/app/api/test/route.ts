/*
 * @Author: shaoliye
 * @Date: 2026-04-24 15:41:31
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-24 16:34:38
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { upstreamError } from "@/app/api/_utils/response"

export async function GET() {
  // 示例接口：浏览器请求 /api/test，BFF 再转发到 NestJS /test。
  const res = await fetch(`${process.env.NEST_BASE_URL}/test`)

  if (!res.ok) {
    return upstreamError(res.status)
  }

  // NestJS 已经统一包装响应，这里直接透传，避免出现双层 data。
  const data = await res.json()
  return Response.json(data)
}
