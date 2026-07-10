/**
 * 业务异常基类。
 *
 * 业务层通过该异常同时声明 HTTP 状态、稳定业务错误码和面向调用方的中文文案，
 * 最终响应结构由全局异常过滤器统一生成。
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiErrorDetail } from '@workspace/contracts/common';

/** 创建业务异常时允许传入的配置。 */
export interface BusinessExceptionOptions {
  /** 前后端可稳定判断的业务错误码。 */
  code: ApiErrorCode;
  /** 可以安全展示给调用方的中文错误文案。 */
  message: string;
  /** 对应的 HTTP 状态码，默认按 400 处理。 */
  status?: HttpStatus;
  /** 可选的字段级或规则级错误详情。 */
  details?: ApiErrorDetail[];
  /** 原始异常，仅用于服务端保留异常因果链，不会返回给调用方。 */
  cause?: unknown;
}

/**
 * 携带稳定业务错误码的 HTTP 异常。
 *
 * 业务 Service 应优先抛出该异常，避免 Controller 自行拼接响应体，也避免错误文案承担程序分支判断职责。
 */
export class BusinessException extends HttpException {
  /** 前后端可稳定判断的业务错误码。 */
  readonly code: ApiErrorCode;

  /** 可选的字段级或规则级错误详情。 */
  readonly details?: ApiErrorDetail[];

  /**
   * 创建业务异常。
   *
   * @param options 业务错误码、中文文案、HTTP 状态和可选详情。
   */
  constructor(options: BusinessExceptionOptions) {
    const status = options.status ?? HttpStatus.BAD_REQUEST;
    const details = options.details ? [...options.details] : undefined;

    super(
      {
        code: options.code,
        message: options.message,
        ...(details?.length ? { details } : {}),
      },
      status,
      options.cause === undefined ? undefined : { cause: options.cause },
    );

    this.code = options.code;
    this.details = details;
  }
}
