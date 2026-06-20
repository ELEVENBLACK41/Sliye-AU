import type { ApiResponse } from '@workspace/contracts/common';

const DEFAULT_NEST_API_PREFIX = 'api/v1';

export type NestResponse<T> = {
  body: ApiResponse<T | null>;
  status: number;
};

type NestRequestOptions<TBody = unknown> = Omit<RequestInit, 'body'> & {
  body?: TBody;
};

// BFF 侧请求 NestJS，上游不可用时也返回统一结构，避免 Route Handler 泄漏框架 500。
export async function requestNest<TData, TBody = unknown>(
  path: string,
  options?: NestRequestOptions<TBody>,
): Promise<NestResponse<TData>> {
  const baseUrl = getNestBaseUrl();

  if (!baseUrl) {
    return createBffError<TData>('NEST_BASE_URL 未配置，无法连接后端服务', 500);
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

    return {
      body: await parseNestBody<TData>(response),
      status: response.status,
    };
  } catch {
    return createBffError<TData>('后端服务暂不可用，请稍后再试', 503);
  }
}

// 读取 Nest 服务地址，并自动补全默认 API 前缀，兼容旧的本地 NEST_BASE_URL 写法。
function getNestBaseUrl() {
  const baseUrl = process.env.NEST_BASE_URL?.replace(/\/+$/, '');

  if (!baseUrl) {
    return undefined;
  }

  const apiPrefix = normalizeApiPrefix(
    process.env.NEST_API_PREFIX ?? DEFAULT_NEST_API_PREFIX,
  );

  if (!apiPrefix || baseUrl.endsWith(`/${apiPrefix}`)) {
    return baseUrl;
  }

  return `${baseUrl}/${apiPrefix}`;
}

// 标准化 Nest API 前缀，允许通过 NEST_API_PREFIX="" 显式关闭前缀拼接。
function normalizeApiPrefix(prefix: string) {
  return prefix.replace(/^\/+|\/+$/g, '');
}

function formatBody<TBody>(body: TBody | undefined, headers: Headers) {
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

async function parseNestBody<T>(response: Response): Promise<ApiResponse<T | null>> {
  try {
    return (await response.json()) as ApiResponse<T | null>;
  } catch {
    return {
      code: response.status,
      message: response.ok ? 'success' : '后端服务响应格式异常',
      data: null,
      timestamp: Date.now(),
    };
  }
}

function createBffError<T>(message: string, status: number): NestResponse<T> {
  return {
    status,
    body: {
      code: status,
      message,
      data: null,
      timestamp: Date.now(),
    },
  };
}
