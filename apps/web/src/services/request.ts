/**
 * 浏览器请求服务，web请求Next服务端，统一处理 BFF 响应、业务错误和登录会话续签。
 * Browser to Next BFF
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { ApiErrorCode, ApiErrorDetail, ApiErrorResponse, ApiResponse } from '@workspace/contracts/common';

/** 支持普通 JSON 对象的请求初始化参数。 */
type JsonRequestInit<TBody = unknown> = Omit<RequestInit, 'body'> & {
  /** 发送给 BFF 的请求体；普通对象会自动序列化为 JSON。 */
  body?: TBody;
};

/** `requestData` 额外支持的页面级兜底错误文案。 */
type RequestDataOptions<TBody = unknown> = JsonRequestInit<TBody> & {
  /** BFF 没有返回可展示消息时使用的中文兜底文案。 */
  errorMessage?: string;
};

/** 创建 `ApiClientError` 所需的结构化错误信息。 */
type ApiClientErrorOptions = {
  /** HTTP 状态码；网络层尚未收到响应时为 `0`。 */
  status: number;
  /** 前后端约定的稳定业务错误码。 */
  code: ApiErrorCode;
  /** 面向用户展示的中文错误说明。 */
  message: string;
  /** 可选的字段级校验错误明细。 */
  details?: ApiErrorDetail[];
  /** 可选的链路请求标识，便于结合服务端日志排查。 */
  requestId?: string;
};

/**
 * 浏览器 API 请求错误。
 *
 * 页面既可以沿用 `message` 展示中文提示，也可以通过业务码和 requestId
 * 做稳定分支判断与问题追踪，避免把结构化错误退化成普通 `Error`。
 */
export class ApiClientError extends Error {
  /** HTTP 状态码；网络错误为 `0`。 */
  readonly status: number;

  /** 前后端共享的稳定业务错误码。 */
  readonly code: ApiErrorCode;

  /** 字段级校验错误明细。 */
  readonly details?: ApiErrorDetail[];

  /** 贯穿 BFF 与 Nest 日志的请求标识。 */
  readonly requestId?: string;

  /** 根据结构化 API 错误创建浏览器异常。 */
  constructor(options: ApiClientErrorOptions) {
    super(options.message);
    this.name = 'ApiClientError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
  }
}

/** 当前正在进行的浏览器会话续签，同一时刻只允许存在一个请求。 */
let refreshRequest: Promise<boolean> | null = null;

/**
 * 浏览器侧请求 Next.js BFF。
 *
 * access token 失效时会等待同一个 refresh 请求并重试一次，从而避免
 * refresh token 轮换场景下多个并发 401 相互撤销会话。
 */
export async function request<T = unknown, TBody = unknown>(
  url: string,
  options?: JsonRequestInit<TBody>,
  fallbackErrorMessage = '请求失败，请稍后再试',
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? '';
  const requestUrl = `${baseUrl}${url}`;
  const headers = new Headers(options?.headers);
  const body = formatBody(options?.body, headers);
  const requestInit: RequestInit = {
    ...options,
    headers,
    body,
    credentials: options?.credentials ?? 'include',
  };

  let response = await fetchBff(requestUrl, requestInit);

  if (response.status === 401 && shouldRefreshBeforeRetry(url)) {
    const refreshed = await refreshAuthSessionOnce(baseUrl);

    if (refreshed) {
      response = await fetchBff(requestUrl, requestInit);
    }
  }

  const responseBody = await parseJsonBody(response);

  if (!response.ok) {
    throw createClientError(response.status, responseBody, fallbackErrorMessage);
  }

  return responseBody as T;
}

/** 解包统一响应，只把 `success: true` 的业务数据返回给页面层。 */
export async function requestData<TData, TBody = unknown>(
  url: string,
  options?: RequestDataOptions<TBody>,
): Promise<TData> {
  const { errorMessage = '请求失败，请稍后再试', ...requestOptions } = options ?? {};
  const result = await request<ApiResponse<TData>, TBody>(url, requestOptions, errorMessage);

  if (!result.success) {
    throw new ApiClientError({
      status: 200,
      code: result.code,
      message: result.message || errorMessage,
      details: result.details,
      requestId: result.requestId,
    });
  }

  return result.data;
}

/** 执行 BFF 请求，并把尚未收到 HTTP 响应的网络异常转换为统一客户端错误。 */
async function fetchBff(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiClientError({
      status: 0,
      code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
      message: '网络连接失败，请检查网络后重试',
    });
  }
}

/** 普通对象自动转 JSON，`FormData` 和字符串保持原样透传。 */
function formatBody<TBody>(body: TBody | undefined, headers: Headers): BodyInit | undefined {
  if (body === undefined || body === null) {
    return undefined;
  }

  if (typeof body === 'string' || body instanceof FormData) {
    return body;
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return JSON.stringify(body);
}

/** 判断当前请求是否适合走 refresh 与单次重试，避免认证接口形成刷新循环。 */
function shouldRefreshBeforeRetry(url: string): boolean {
  return !url.startsWith('/api/auth/login') && !url.startsWith('/api/auth/refresh');
}

/** 复用当前正在进行的 refresh 请求，完成后及时清理 single-flight 状态。 */
function refreshAuthSessionOnce(baseUrl: string): Promise<boolean> {
  if (!refreshRequest) {
    refreshRequest = refreshAuthSession(baseUrl).finally(() => {
      refreshRequest = null;
    });
  }

  return refreshRequest;
}

/** 调用 BFF refresh 接口轮换 httpOnly Cookie，并判断统一成功响应。 */
async function refreshAuthSession(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      return false;
    }

    const body = await parseJsonBody(response);
    return isSuccessResponse(body);
  } catch {
    return false;
  }
}

/** 安全解析 JSON 响应；空响应或非 JSON 响应返回 `null`。 */
async function parseJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** 判断未知数据是否为统一失败响应。 */
function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ApiErrorResponse>;
  return (
    candidate.success === false &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.requestId === 'string'
  );
}

/** 判断 refresh 接口是否返回了统一成功响应。 */
function isSuccessResponse(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && (value as { success?: unknown }).success === true);
}

/** 根据 HTTP 状态和统一失败响应创建结构化客户端错误。 */
function createClientError(status: number, body: unknown, fallbackMessage: string): ApiClientError {
  if (isApiErrorResponse(body)) {
    return new ApiClientError({
      status,
      code: body.code,
      message: body.message || fallbackMessage,
      details: body.details,
      requestId: body.requestId,
    });
  }

  return new ApiClientError({
    status,
    code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
    message: fallbackMessage,
  });
}
