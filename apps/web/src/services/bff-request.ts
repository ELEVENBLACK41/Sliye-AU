/**
 * @module services/bff-request
 *
 * BFF 层共享请求工具 —— Next.js Route Handler 到 NestJS 的 fetch 封装。
 *
 * 所有 Route Handler 都应通过 `requestNest()` 请求上游，不要直接 fetch。
 * 这样 NestJS 宕机时自动返回结构化 503，无需每个 route 手写 try-catch。
 *
 * 使用方式：
 * ```ts
 * // 在 *-bff.service.ts 中
 * const upstream = await requestNest<UserInfo>("/user/profile")
 * return NextResponse.json(upstream.body, { status: upstream.status })
 * ```
 *
 * 请求链路：
 *   浏览器 request() → Next.js BFF Route Handler → requestNest() → NestJS 后端
 */

/** 后端统一响应结构（与客户端 request.ts 中的 ApiResponse 保持一致） */
type ApiResponse<T> = {
  code: number
  message?: string
  data: T
  timestamp?: number
}

/** requestNest 的返回结构：将 HTTP status 和解析后的 body 一起返回 */
export type NestResponse<T> = {
  body: ApiResponse<T | null>
  status: number
}

/** requestNest 的请求选项，body 支持泛型（与 JsonRequestInit 同理） */
type NestRequestOptions<TBody = unknown> = Omit<RequestInit, "body"> & {
  body?: TBody
}

/**
 * BFF 层统一请求 NestJS 上游
 *
 * 内置三重保障：
 * 1. `NEST_BASE_URL` 未配置 → 返回 500 结构化错误
 * 2. `fetch()` 抛 TypeError（NestJS 宕机/网络不通） → 返回 503 结构化错误
 * 3. 响应体非 JSON（NestJS 返回异常格式） → 降级为兜底 ApiResponse
 *
 * Route Handler 只需 `NextResponse.json(upstream.body, { status: upstream.status })`，
 * 无需手写任何 try-catch。
 *
 * @template TData - 业务数据 data 字段的类型
 * @template TBody - 请求体类型
 * @param path     - NestJS 路径（如 `/auth/login`），会自动拼接 NEST_BASE_URL
 * @param options  - fetch 选项，body 支持普通对象自动 JSON 序列化
 */
export async function requestNest<TData, TBody = unknown>(  //简单理解 requestNest<收到什么, 寄出什么>(地址, 包裹)
  path: string,
  options?: NestRequestOptions<TBody>,
): Promise<NestResponse<TData>> {
  const baseUrl = getNestBaseUrl()

  if (!baseUrl) {
    return createBffError<TData>("NEST_BASE_URL 未配置，无法连接后端服务", 500)
  }

  const headers = new Headers(options?.headers)
  const body = formatBody(options?.body, headers)

  try {
    // BFF 到 Nest 是服务端内部请求，默认禁用缓存，避免认证状态拿到旧数据
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body,
      cache: options?.cache ?? "no-store",
    })

    return {
      body: await parseNestBody<TData>(response),
      status: response.status,
    }
  } catch {
    // fetch 本身抛出异常（NestJS 未启动、网络不通等）
    // 捕获后返回结构化错误，避免异常冒泡到 Next.js 框架层变成空洞 500
    return createBffError<TData>("后端服务暂不可用，请稍后再试", 503)
  }
}

/** 从环境变量获取 NestJS 基础 URL，去掉末尾斜杠 */
function getNestBaseUrl() {
  return process.env.NEST_BASE_URL?.replace(/\/$/, "")
}

/**
 * 请求体格式化
 *
 * - undefined / null → 不发送 body
 * - string / FormData → 直接透传
 * - 普通对象 → JSON.stringify + 自动设置 Content-Type: application/json
 */
function formatBody<TBody>(body: TBody | undefined, headers: Headers) {
  if (body === undefined || body === null) {
    return undefined
  }

  if (typeof body === "string" || body instanceof FormData) {
    return body
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return JSON.stringify(body)
}

/**
 * 安全解析 NestJS 响应体
 *
 * 正常情况解析 JSON 为 ApiResponse；如果响应体非 JSON（如 502 页面），
 * 降级为兜底结构，保证返回值始终是 ApiResponse 类型。
 */
async function parseNestBody<T>(
  response: Response,
): Promise<ApiResponse<T | null>> {
  try {
    return (await response.json()) as ApiResponse<T | null>
  } catch {
    return {
      code: response.status,
      message: response.ok ? "success" : "后端服务响应格式异常",
      data: null,
      timestamp: Date.now(),
    }
  }
}

/** 构造 BFF 层结构化错误响应（用于 NestJS 不可用等场景） */
function createBffError<T>(message: string, status: number): NestResponse<T> {
  return {
    status,
    body: {
      code: status,
      message,
      data: null,
      timestamp: Date.now(),
    },
  }
}
