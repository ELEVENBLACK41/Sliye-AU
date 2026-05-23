/*
 * @Author: shaoliye
 * @Date: 2026-05-06 16:52:37
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-06 17:04:37
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Copyright: Copyright 1990 - 2026
 *
 * @module services/request
 *
 * 客户端 HTTP 请求层 —— 完整请求链路：
 *
 *   浏览器 request() → Next.js BFF Route Handler → requestNest() → NestJS 后端
 *
 * 本模块提供两级封装：
 *   - `request()`    底层 fetch 封装，只关心 HTTP 层（拼 baseUrl、格式化 body、检查 res.ok）
 *   - `requestData()` 业务层封装，解包后端统一响应 ApiResponse，检查 code===0 后提取 data
 */

/**
 * 后端统一响应结构
 *
 * 所有 NestJS 接口均返回此格式，例如：
 * ```json
 * { "code": 0, "message": "success", "data": { ... }, "timestamp": 1715000000 }
 * ```
 *
 * @template T - `data` 字段的类型
 */
type ApiResponse<T> = {
  /** 业务状态码，约定 0 = 成功，非 0 = 业务异常 */
  code: number
  message?: string
  data: T
  timestamp?: number
}

/**
 * RequestInit 的泛型封装
 *
 * 将原生 `RequestInit.body` 替换为泛型 `TBody`，让调用方可以用具体类型
 * 声明请求体（例如 `LoginDto`），而不用手动 `JSON.stringify`。
 *
 * @template TBody - 请求体的类型，默认 unknown
 */
type JsonRequestInit<TBody = unknown> = Omit<RequestInit, "body"> & {
  body?: TBody
}

/**
 * requestData 的选项类型
 *
 * 在 JsonRequestInit 基础上扩展 `errorMessage`，允许调用方自定义
 * 业务异常时的兜底提示文案。
 *
 * @template TBody - 请求体的类型
 */
type RequestDataOptions<TBody = unknown> = JsonRequestInit<TBody> & {
  /** 业务异常时的兜底错误提示，优先级低于后端返回的 message */
  errorMessage?: string
}

/**
 * 底层 fetch 封装
 *
 * 职责：
 * 1. 拼接 `NEXT_PUBLIC_BASE_URL` 前缀（默认当前域名，即 Next.js BFF）
 * 2. 通过 `formatBody()` 自动格式化请求体（普通对象 → JSON，FormData/字符串透传）
 * 3. 检查 `res.ok`（HTTP 2xx），非 2xx 直接抛错
 *
 * ⚠️ 此函数不做业务层检查（不解析 ApiResponse），适用于需要自定义响应处理的场景。
 *    大部分页面应优先使用 `requestData()`。
 *
 * @template T      - 响应体 JSON 的类型
 * @template TBody  - 请求体类型
 * @param url       - 请求路径，会自动拼接 baseUrl（如 `/api/auth/login`）
 * @param options   - fetch 选项，body 支持泛型
 * @returns 解析后的 JSON 响应体
 * @throws HTTP 非 2xx 时抛出 `Error("Request error: {status}")`
 *
 * @example
 * ```ts
 * // 简单 GET
 * const data = await request<UserInfo>("/api/user/profile")
 *
 * // POST with body
 * const res = await request<ApiResponse<boolean>, LoginDto>("/api/auth/login", {
 *   method: "POST",
 *   body: { username: "admin", password: "xxx" },
 * })
 * ```
 */
export async function request<T = unknown, TBody = unknown>(
  url: string,
  options?: JsonRequestInit<TBody>,
): Promise<T> {
  // 从环境变量获取基础 URL，默认为空（即请求发往当前 Next.js 服务 / BFF）
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? ""
  // 将传入的 headers 合并到 Headers 实例，方便后续 formatBody 追加 Content-Type
  const headers = new Headers(options?.headers)
  // 自动格式化请求体（普通对象 → JSON.stringify，FormData / 字符串透传）
  const body = formatBody(options?.body, headers)

  // 发起 fetch 请求，res 是浏览器原生 Response 对象
  const res = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers,
    body,
  })

  // HTTP 层检查：非 2xx 尝试从响应体提取错误信息
  if (!res.ok) {
    let errorMessage = `请求失败 (${res.status})`
    try {
      const errorBody = await res.json()
      if (errorBody?.message) {
        errorMessage = errorBody.message
      }
    } catch {
      // 响应体非 JSON（如 Next.js 框架兜底的空 500），使用默认 message
    }
    throw new Error(errorMessage)
  }

  // 解析 JSON 响应体并返回
  return res.json() as Promise<T>
}

/**
 * 业务层请求封装（推荐使用）
 *
 * 在 `request()` 基础上增加：
 * 1. 解包 `ApiResponse<T>` → 提取 `data` 字段
 * 2. 检查 `code === 0` 且 `data !== null`，否则视为业务异常
 * 3. 错误提示优先级：后端 `message` > 调用方 `errorMessage` > 兜底文案
 *
 * @template TData  - 业务数据 data 字段的类型
 * @template TBody  - 请求体类型
 * @param url       - 请求路径
 * @param options   - 请求选项，额外支持 errorMessage 自定义兜底提示
 * @returns 解包后的 `data` 字段（类型为 TData）
 * @throws 业务异常时抛出 `Error`，message 取优先级最高的提示文案
 *
 * @example
 * ```ts
 * // 自动解包，直接拿到 data
 * const user = await requestData<UserInfo>("/api/user/profile")
 *
 * // 自定义错误提示
 * const result = await requestData<boolean, LoginDto>("/api/auth/login", {
 *   method: "POST",
 *   body: { username: "admin", password: "xxx" },
 *   errorMessage: "登录失败，请检查账号密码",
 * })
 * ```
 */
export async function requestData<TData, TBody = unknown>(
  url: string,
  options?: RequestDataOptions<TBody>,
): Promise<TData> {
  // 从 options 中提取 errorMessage，其余传给底层 request()
  const { errorMessage, ...requestOptions } = options ?? {}
  const result = await request<ApiResponse<TData | null>, TBody>(
    url,
    requestOptions,
  )

  // 约定后端 code=0 且 data 非 null 才是真正业务成功
  // HTTP 200 但 code 非 0 也要抛给页面展示
  if (result.code !== 0 || result.data === null) {
    throw new Error(result.message || errorMessage || "请求失败，请稍后再试")
  }

  return result.data
}

/**
 * 请求体格式化
 *
 * 根据传入的 body 类型自动处理：
 * - `undefined` / `null` → 不发送 body（如 GET 请求）
 * - `string` / `FormData` → 直接透传（文件上传等场景由调用方自行构造）
 * - 普通对象 → `JSON.stringify()` + 自动设置 `Content-Type: application/json`
 *
 * 这样业务层调用 `request()` 时只需传普通对象，无需手动序列化。
 *
 * @template TBody - body 的类型
 * @param body     - 原始请求体
 * @param headers  - Headers 实例，可能会被追加 Content-Type
 * @returns 格式化后的 body（string | FormData | undefined）
 */
function formatBody<TBody>(body: TBody | undefined, headers: Headers) {
  // 无 body，直接跳过（GET、DELETE 等不需要 body 的请求）
  if (body === undefined || body === null) {
    return undefined
  }

  // 已经是字符串或 FormData，直接透传
  if (typeof body === "string" || body instanceof FormData) {
    return body
  }

  // 普通对象 → JSON 序列化，业务 service 不用每个接口重复写 headers/body
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return JSON.stringify(body)
}
