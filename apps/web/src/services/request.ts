import type { ApiResponse } from "@workspace/contracts/common"

type JsonRequestInit<TBody = unknown> = Omit<RequestInit, "body"> & {
  body?: TBody
}

type RequestDataOptions<TBody = unknown> = JsonRequestInit<TBody> & {
  errorMessage?: string
}

// 浏览器侧请求 Next.js BFF，负责拼接 baseUrl、序列化 body、检查 HTTP 状态。
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
    let errorMessage = `请求失败 (${res.status})`
    try {
      const errorBody = await res.json()
      if (errorBody?.message) {
        errorMessage = errorBody.message
      }
    } catch {
      // 非 JSON 错误响应时使用默认错误文案。
    }
    throw new Error(errorMessage)
  }

  return res.json() as Promise<T>
}

// 解包统一响应，只把成功的 data 返回给页面层。
export async function requestData<TData, TBody = unknown>(
  url: string,
  options?: RequestDataOptions<TBody>,
): Promise<TData> {
  const { errorMessage, ...requestOptions } = options ?? {}
  const result = await request<ApiResponse<TData | null>, TBody>(
    url,
    requestOptions,
  )

  if (result.code !== 200 || result.data === null) {
    throw new Error(result.message || errorMessage || "请求失败，请稍后再试")
  }

  return result.data
}

// 普通对象自动转 JSON，FormData/string 保持原样透传。
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
