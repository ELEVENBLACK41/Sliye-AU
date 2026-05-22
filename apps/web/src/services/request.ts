/*
 * @Author: shaoliye
 * @Date: 2026-05-06 16:52:37
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-06 17:04:37
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */
type ApiResponse<T> = {
  code: number
  message?: string
  data: T
  timestamp?: number
}

type JsonRequestInit<TBody = unknown> = Omit<RequestInit, "body"> & {
  body?: TBody
}

type RequestDataOptions<TBody = unknown> = JsonRequestInit<TBody> & {
  errorMessage?: string
}

// services/request.ts
export async function request<T = unknown, TBody = unknown>(
  url: string,
  options?: JsonRequestInit<TBody>,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? ""
  const headers = new Headers(options?.headers)
  const body = formatBody(options?.body, headers)

  const res = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers,
    body,
  })

  if (!res.ok) {
    throw new Error(`Request error: ${res.status}`)
  }

  return res.json() as Promise<T>
}

export async function requestData<TData, TBody = unknown>(
  url: string,
  options?: RequestDataOptions<TBody>,
): Promise<TData> {
  const { errorMessage, ...requestOptions } = options ?? {}
  const result = await request<ApiResponse<TData | null>, TBody>(
    url,
    requestOptions,
  )

  // 约定后端 code=0 才是真正业务成功；HTTP 200 但 code 非 0 也要抛给页面展示。
  if (result.code !== 0 || result.data === null) {
    throw new Error(result.message || errorMessage || "请求失败，请稍后再试")
  }

  return result.data
}

function formatBody<TBody>(body: TBody | undefined, headers: Headers) {
  if (body === undefined || body === null) {
    return undefined
  }

  if (typeof body === "string" || body instanceof FormData) {
    return body
  }

  // 普通对象默认按 JSON 发，业务 service 就不用每个接口重复写 headers/body。
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return JSON.stringify(body)
}
