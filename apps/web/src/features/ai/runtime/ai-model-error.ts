/**
 * 本文件把 AI SDK、AI Gateway、超时和取消异常转换为稳定的共享业务错误。
 * 返回给浏览器的消息始终脱敏，原始异常只允许留在服务端日志中。
 */

import { APICallError, TypeValidationError } from 'ai';
import {
  GatewayAuthenticationError,
  GatewayForbiddenError,
  GatewayInternalServerError,
  GatewayInvalidRequestError,
  GatewayModelNotFoundError,
  GatewayRateLimitError,
  GatewayResponseError,
} from '@ai-sdk/gateway';
import { API_ERROR_CODES } from '@workspace/contracts/common';
import type { ApiErrorCode } from '@workspace/contracts/common';

import { AiModelConfigurationError } from './ai-model-registry.ts';

/** 一条可安全返回浏览器并可供服务端重试决策使用的模型错误。 */
export type NormalizedAiModelError = {
  /** 稳定的跨端业务错误码。 */
  code: ApiErrorCode;
  /** 建议返回的 HTTP 状态码。 */
  status: number;
  /** 不包含供应商响应正文、密钥或内部地址的中文消息。 */
  message: string;
  /** 调用方是否可以在新请求中重试。 */
  retryable: boolean;
};

/** 将任意模型异常映射为稳定、脱敏且可判定重试性的错误。 */
export function normalizeAiModelError(error: unknown): NormalizedAiModelError {
  if (error instanceof AiModelConfigurationError) {
    return createNormalizedError(
      API_ERROR_CODES.AI_MODEL_CONFIGURATION_INVALID,
      500,
      'AI 模型配置不正确，请联系管理员检查服务端配置',
      false,
    );
  }

  if (hasErrorName(error, 'TimeoutError') || findStatusCode(error) === 408 || findStatusCode(error) === 504) {
    return createNormalizedError(API_ERROR_CODES.AI_MODEL_TIMEOUT, 504, 'AI 响应超时，请稍后重试', true);
  }

  if (hasErrorName(error, 'AbortError')) {
    return createNormalizedError(API_ERROR_CODES.AI_MODEL_CANCELLED, 499, 'AI 请求已取消', false);
  }

  if (
    GatewayAuthenticationError.isInstance(error) ||
    GatewayForbiddenError.isInstance(error) ||
    findStatusCode(error) === 401 ||
    findStatusCode(error) === 403
  ) {
    return createNormalizedError(
      API_ERROR_CODES.AI_MODEL_AUTHENTICATION_FAILED,
      503,
      'AI 模型服务尚未正确授权，请联系管理员',
      false,
    );
  }

  if (findStatusCode(error) === 402) {
    return createNormalizedError(
      API_ERROR_CODES.AI_MODEL_BUDGET_EXCEEDED,
      503,
      'AI 使用额度暂时不足，请联系管理员',
      false,
    );
  }

  if (GatewayRateLimitError.isInstance(error) || findStatusCode(error) === 429) {
    return createNormalizedError(API_ERROR_CODES.AI_MODEL_RATE_LIMITED, 429, 'AI 请求较多，请稍后重试', true);
  }

  if (GatewayModelNotFoundError.isInstance(error) || findStatusCode(error) === 404) {
    return createNormalizedError(API_ERROR_CODES.AI_MODEL_NOT_FOUND, 503, '当前 AI 模型暂不可用，请联系管理员', false);
  }

  if (TypeValidationError.isInstance(error) || GatewayResponseError.isInstance(error)) {
    return createNormalizedError(
      API_ERROR_CODES.AI_MODEL_RESPONSE_INVALID,
      502,
      'AI 返回内容格式异常，请重新尝试',
      true,
    );
  }

  if (GatewayInternalServerError.isInstance(error) || (findStatusCode(error) ?? 0) >= 500) {
    return createNormalizedError(API_ERROR_CODES.AI_MODEL_UNAVAILABLE, 503, 'AI 模型服务暂时不可用，请稍后重试', true);
  }

  if (GatewayInvalidRequestError.isInstance(error) || APICallError.isInstance(error)) {
    return createNormalizedError(API_ERROR_CODES.AI_MODEL_REQUEST_FAILED, 502, 'AI 请求处理失败，请重新尝试', false);
  }

  return createNormalizedError(API_ERROR_CODES.AI_MODEL_UNAVAILABLE, 503, 'AI 模型服务暂时不可用，请稍后重试', true);
}

/** 构造一条类型完整的模型错误，避免各分支遗漏重试或状态信息。 */
function createNormalizedError(
  code: ApiErrorCode,
  status: number,
  message: string,
  retryable: boolean,
): NormalizedAiModelError {
  return {
    code,
    status,
    message,
    retryable,
  };
}

/** 在异常 cause 链中查找 HTTP 状态码，兼容 AI SDK 对供应商异常的包装。 */
function findStatusCode(error: unknown, depth = 0): number | undefined {
  if (!isErrorRecord(error) || depth > 4) {
    return undefined;
  }

  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  return findStatusCode(error.cause, depth + 1);
}

/** 在异常 cause 链中查找 DOMException 或供应商暴露的错误名称。 */
function hasErrorName(error: unknown, expectedName: string, depth = 0): boolean {
  if (!isErrorRecord(error) || depth > 4) {
    return false;
  }

  return error.name === expectedName || hasErrorName(error.cause, expectedName, depth + 1);
}

/** 判断未知值是否具备错误对象可能使用的安全字段。 */
function isErrorRecord(value: unknown): value is { name?: unknown; statusCode?: unknown; cause?: unknown } {
  return typeof value === 'object' && value !== null;
}
