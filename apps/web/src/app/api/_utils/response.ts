/**
 * Next.js BFF 自身的统一成功与失败响应工具。
 */
import { NextResponse } from 'next/server';
import { API_ERROR_CODES, API_SUCCESS_CODE } from '@workspace/contracts/common';
import type { ApiErrorCode, ApiErrorDetail, ApiErrorResponse, ApiSuccessResponse } from '@workspace/contracts/common';

/** 创建 BFF 失败响应所需的参数。 */
type ApiErrorOptions = {
  /** 返回给浏览器的 HTTP 状态码。 */
  status?: number;
  /** 面向用户展示的中文错误说明。 */
  message: string;
  /** 稳定业务错误码；省略时根据 HTTP 状态推导。 */
  code?: ApiErrorCode;
  /** 可选的字段级校验错误明细。 */
  details?: ApiErrorDetail[];
  /** 当前请求路径。 */
  path?: string;
  /** 已存在的链路请求标识；省略时由 BFF 生成。 */
  requestId?: string;
};

/** 创建 BFF 成功响应所需的参数。 */
type ApiSuccessOptions<T> = {
  /** 返回给浏览器的真实业务数据。 */
  data: T;
  /** 面向用户展示的中文成功说明。 */
  message?: string;
  /** 返回给浏览器的 HTTP 状态码。 */
  status?: number;
  /** 已存在的链路请求标识；省略时由 BFF 生成。 */
  requestId?: string;
};

/** 返回符合共享契约的 BFF 失败响应。 */
export function apiError({
  message,
  status = 500,
  code = mapStatusToErrorCode(status),
  details,
  path = '',
  requestId = crypto.randomUUID(),
}: ApiErrorOptions): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      code,
      message,
      data: null,
      ...(details?.length ? { details } : {}),
      timestamp: Date.now(),
      requestId,
      path,
    },
    { status },
  );
}

/** 返回符合共享契约的 BFF 成功响应。 */
export function apiSuccess<T>({
  data,
  message = '操作成功',
  status = 200,
  requestId = crypto.randomUUID(),
}: ApiSuccessOptions<T>): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      code: API_SUCCESS_CODE,
      message,
      data,
      timestamp: Date.now(),
      requestId,
    },
    { status },
  );
}

/**
 * 把未知异常转换成脱敏的统一失败响应。
 *
 * 未知异常的原始 message 可能包含服务地址、堆栈或实现细节，因此这里
 * 始终使用调用方提供的中文兜底文案。
 */
export function apiErrorFromUnknown(
  _error: unknown,
  fallbackMessage: string,
  status = 500,
  path = '',
): NextResponse<ApiErrorResponse> {
  return apiError({
    status,
    message: fallbackMessage,
    path,
  });
}

/** 将上游 HTTP 失败转换为 BFF 的统一中文失败响应。 */
export function upstreamError(
  status: number,
  message = '上游服务请求失败，请稍后再试',
  path = '',
): NextResponse<ApiErrorResponse> {
  return apiError({
    status,
    message,
    path,
  });
}

/** 根据 HTTP 状态码选择稳定业务错误码。 */
function mapStatusToErrorCode(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return API_ERROR_CODES.COMMON_VALIDATION_FAILED;
    case 401:
      return API_ERROR_CODES.AUTH_UNAUTHORIZED;
    case 403:
      return API_ERROR_CODES.ACCESS_PERMISSION_DENIED;
    case 404:
      return API_ERROR_CODES.COMMON_NOT_FOUND;
    case 409:
      return API_ERROR_CODES.RESOURCE_CONFLICT;
    default:
      return API_ERROR_CODES.COMMON_INTERNAL_ERROR;
  }
}
