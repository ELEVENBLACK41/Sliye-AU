/**
 * Web BFF 到 NestJS 的服务端请求工具，负责保留统一响应与请求链路标识。
 */
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { ApiErrorResponse, ApiResponse } from '@workspace/contracts/common';

/** NestJS 默认 API 前缀。 */
const DEFAULT_NEST_API_PREFIX = 'api/v1';

/** NestJS 返回非统一响应时，BFF 对浏览器返回的网关错误状态码。 */
const UPSTREAM_RESPONSE_FORMAT_ERROR_STATUS = 502;

/** BFF 调用 NestJS 后返回给 Route Handler 的结果。 */
export type NestResponse<T> = {
  /** NestJS 的统一成功或失败响应体。 */
  body: ApiResponse<T>;
  /** NestJS 返回的 HTTP 状态码，或 BFF 生成的网关错误状态码。 */
  status: number;
};

/** 解析上游响应后的结果，额外标记其是否符合共享 API 契约。 */
type ParsedNestResponse<T> = {
  /** 供 BFF 原样转发或脱敏返回的统一响应体。 */
  body: ApiResponse<T>;
  /** 上游响应是否可被确认符合共享 API 响应契约。 */
  isValid: boolean;
};

/** 支持普通 JSON 对象的 NestJS 请求参数。 */
type NestRequestOptions<TBody = unknown> = Omit<RequestInit, 'body'> & {
  /** 发送给 NestJS 的请求体；普通对象会自动序列化为 JSON。 */
  body?: TBody;
};

/**
 * BFF 侧请求 NestJS。
 *
 * 上游返回统一响应时保持原始业务码和 requestId；上游不可用或响应格式
 * 异常时，由 BFF 生成脱敏的中文失败响应，避免向浏览器泄漏内部异常。
 */
export async function requestNest<TData, TBody = unknown>(
  path: string,
  options?: NestRequestOptions<TBody>,
): Promise<NestResponse<TData>> {
  const baseUrl = getNestBaseUrl();

  if (!baseUrl) {
    return createBffError<TData>('服务暂不可用，请稍后再试', 500, path);
  }

  const headers = new Headers(options?.headers);
  const body = formatBody(options?.body, headers);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body,
      cache: options?.cache ?? 'no-store',
    });

    const parsed = await parseNestBody<TData>(response, path);

    return {
      body: parsed.body,
      // 上游即便错误地返回 200，只要响应体不符合契约，就不能把失败伪装成成功。
      status: parsed.isValid ? response.status : UPSTREAM_RESPONSE_FORMAT_ERROR_STATUS,
    };
  } catch {
    return createBffError<TData>('后端服务暂不可用，请稍后再试', 503, path);
  }
}

/** 读取 NestJS 地址，并自动补全默认 API 前缀。 */
function getNestBaseUrl(): string | undefined {
  const baseUrl = process.env.NEST_BASE_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    return undefined;
  }

  const apiPrefix = normalizeApiPrefix(process.env.NEST_API_PREFIX ?? DEFAULT_NEST_API_PREFIX);

  if (!apiPrefix || baseUrl.endsWith(`/${apiPrefix}`)) {
    return baseUrl;
  }

  return `${baseUrl}/${apiPrefix}`;
}

/** 标准化 NestJS API 前缀，并允许通过空字符串关闭前缀拼接。 */
function normalizeApiPrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, '');
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

/** 解析并校验 NestJS 统一响应，格式不合法时返回 BFF 自身的脱敏错误。 */
async function parseNestBody<T>(response: Response, path: string): Promise<ParsedNestResponse<T>> {
  try {
    const body = (await response.json()) as unknown;

    if (isApiResponse<T>(body)) {
      return { body, isValid: true };
    }
  } catch {
    // 非 JSON 响应统一落入下方的格式异常错误，避免泄漏上游原始内容。
  }

  return {
    body: createBffErrorBody(
      '后端服务响应格式异常，请稍后再试',
      response.headers.get('x-request-id') ?? undefined,
      path,
    ),
    isValid: false,
  };
}

/** 对统一响应执行最小结构校验，确保后续可以安全使用判别字段。 */
function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.success === 'boolean' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.timestamp === 'number' &&
    typeof candidate.requestId === 'string' &&
    (candidate.success === true || candidate.data === null)
  );
}

/** 创建包含 HTTP 状态和统一失败响应体的 BFF 错误结果。 */
function createBffError<T>(message: string, status: number, path: string): NestResponse<T> {
  return {
    status,
    body: createBffErrorBody(message, undefined, path),
  };
}

/** 创建 BFF 自身的统一失败响应，并生成可追踪的 requestId。 */
function createBffErrorBody(message: string, requestId: string | undefined, path: string): ApiErrorResponse {
  return {
    success: false,
    code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
    message,
    data: null,
    timestamp: Date.now(),
    requestId: requestId || crypto.randomUUID(),
    path,
  };
}
