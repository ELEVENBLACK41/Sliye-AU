/**
 * HTTP 请求上下文与 requestId 工具。
 *
 * requestId 会在请求对象、响应头和异步上下文之间保持一致，供响应包装、异常日志和后续审计日志复用。
 */

import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response } from 'express';

/** requestId 使用的标准 HTTP 请求头名称。 */
export const REQUEST_ID_HEADER = 'x-request-id';

/** 允许调用方传入的 requestId 最大长度，避免超长日志字段。 */
const MAX_REQUEST_ID_LENGTH = 64;

/** requestId 允许的安全字符，防止换行等控制字符污染日志。 */
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/** 单次 HTTP 请求可共享的上下文数据。 */
export interface RequestContext {
  /** 用于串联响应、日志和审计记录的请求唯一标识。 */
  requestId: string;
}

/** 附加了服务端请求上下文信息的 Express 请求。 */
export type RequestWithContext = Request & {
  /** 当前请求的唯一标识，由请求上下文中间件或响应基础设施写入。 */
  requestId?: string;
};

/** 保存当前异步调用链请求上下文的容器。 */
const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * 为当前请求生成不可预测的唯一标识。
 *
 * @returns UUID 格式的 requestId。
 */
export function createRequestId(): string {
  return randomUUID();
}

/**
 * 校验并规范化调用方传入的 requestId。
 *
 * @param value Express 请求头读取到的原始值。
 * @returns 安全可用的 requestId；无效时返回 undefined，由调用方生成新值。
 */
export function normalizeRequestId(
  value: string | string[] | undefined,
): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !candidate ||
    candidate.length > MAX_REQUEST_ID_LENGTH ||
    !SAFE_REQUEST_ID_PATTERN.test(candidate)
  ) {
    return undefined;
  }

  return candidate;
}

/**
 * 获取或创建当前 HTTP 请求的 requestId，并可同步写入响应头。
 *
 * 即使请求上下文中间件尚未接入，该函数也能保证异常响应和成功响应拥有 requestId。
 *
 * @param request 当前 Express 请求。
 * @param response 可选的 Express 响应，用于写入 `x-request-id` 响应头。
 * @returns 当前请求最终采用的 requestId。
 */
export function ensureRequestId(
  request: RequestWithContext,
  response?: Response,
): string {
  const requestId =
    normalizeRequestId(request.requestId) ??
    normalizeRequestId(request.headers[REQUEST_ID_HEADER]) ??
    createRequestId();

  request.requestId = requestId;
  response?.setHeader(REQUEST_ID_HEADER, requestId);

  return requestId;
}

/**
 * 在当前异步调用链中运行请求处理逻辑。
 *
 * @param context 当前请求上下文。
 * @param callback 需要继承该上下文的处理函数。
 * @returns 处理函数的返回值。
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  callback: () => T,
): T {
  return requestContextStorage.run(context, callback);
}

/**
 * 获取当前异步调用链的请求上下文。
 *
 * @returns 当前请求上下文；不在 HTTP 请求链路内时返回 undefined。
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * 获取当前异步调用链的 requestId。
 *
 * @returns 当前 requestId；不在 HTTP 请求链路内时返回 undefined。
 */
export function getCurrentRequestId(): string | undefined {
  return getRequestContext()?.requestId;
}
