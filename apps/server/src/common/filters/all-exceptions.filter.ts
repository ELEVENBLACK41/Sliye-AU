/**
 * API 全局异常过滤器。
 *
 * 该过滤器将业务异常、Nest HTTP 异常、DTO 校验异常和常见 Prisma 异常转换为统一错误契约，
 * 同时保证未知服务端异常不会向调用方泄露堆栈、数据库结构或内部实现信息。
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import {
  API_ERROR_CODES,
  type ApiErrorCode,
  type ApiErrorDetail,
  type ApiResponse,
} from '@workspace/contracts/common';
import type { Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import {
  ensureRequestId,
  type RequestWithContext,
} from '../request-context/request-context';

/** 对外统一展示的未知服务端错误文案。 */
const INTERNAL_ERROR_MESSAGE = '服务器内部错误，请稍后重试';

/** Nest 常见 HTTP 异常响应体。 */
interface HttpExceptionBody {
  /** Nest 生成的 HTTP 状态码。 */
  statusCode?: number;
  /** 单条错误文案或 DTO 校验产生的多条错误文案。 */
  message?: string | string[];
  /** Nest 默认错误名称。 */
  error?: string;
  /** 可选的字段级错误详情。 */
  details?: ApiErrorDetail[];
}

/** 异常归一化后的内部描述，仅供过滤器构造最终响应。 */
interface ResolvedException {
  /** 最终使用的 HTTP 状态码。 */
  status: HttpStatus;
  /** 前后端可稳定判断的业务错误码。 */
  code: ApiErrorCode;
  /** 可以安全展示给调用方的中文错误文案。 */
  message: string;
  /** 可选的字段级或规则级错误详情。 */
  details?: ApiErrorDetail[];
}

/** 捕获全部未处理异常并输出统一 API 错误响应。 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  /** Nest 日志记录器。 */
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * 捕获异常、完成归一化、记录分级日志并返回统一错误响应。
   *
   * @param exception 请求链路中抛出的未知异常。
   * @param host Nest 当前参数上下文。
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const httpContext = host.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const request = httpContext.getRequest<RequestWithContext>();
    const requestId = ensureRequestId(request, response);
    const path = request.originalUrl || request.url;
    const resolved = this.resolveException(exception);
    const body: ApiResponse<never> = {
      success: false,
      code: resolved.code,
      message: resolved.message,
      data: null,
      ...(resolved.details?.length ? { details: resolved.details } : {}),
      timestamp: Date.now(),
      requestId,
      path,
    };

    this.logException(exception, request, requestId, path, resolved);
    response.status(resolved.status).json(body);
  }

  /**
   * 将任意异常归一化为稳定的状态码、业务码和安全文案。
   *
   * @param exception 请求链路中抛出的未知异常。
   * @returns 可用于构造统一错误响应的异常描述。
   */
  private resolveException(exception: unknown): ResolvedException {
    if (exception instanceof BusinessException) {
      const status = exception.getStatus();

      return {
        status,
        code:
          status >= 500
            ? API_ERROR_CODES.COMMON_INTERNAL_ERROR
            : exception.code,
        message: status >= 500 ? INTERNAL_ERROR_MESSAGE : exception.message,
        ...(status < 500 && exception.details?.length
          ? { details: exception.details }
          : {}),
      };
    }

    if (exception instanceof PrismaClientKnownRequestError) {
      return this.resolvePrismaException(exception);
    }

    if (exception instanceof HttpException) {
      return this.resolveHttpException(exception);
    }

    return this.createInternalError();
  }

  /**
   * 将 Prisma 已知请求异常映射为稳定业务错误。
   *
   * @param exception Prisma 已知请求异常。
   * @returns 不暴露数据库实现细节的异常描述。
   */
  private resolvePrismaException(
    exception: PrismaClientKnownRequestError,
  ): ResolvedException {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          code: API_ERROR_CODES.RESOURCE_CONFLICT,
          message: '数据已存在，请勿重复提交',
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: API_ERROR_CODES.RESOURCE_CONFLICT,
          message: '当前数据仍被其他记录引用，无法完成操作',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: API_ERROR_CODES.COMMON_NOT_FOUND,
          message: '请求的资源不存在',
        };
      default:
        return this.createInternalError();
    }
  }

  /**
   * 将 Nest HTTP 异常映射为稳定业务错误，并提取 DTO 字段级校验详情。
   *
   * @param exception Nest HTTP 异常。
   * @returns 面向调用方的异常描述。
   */
  private resolveHttpException(exception: HttpException): ResolvedException {
    const status = exception.getStatus();

    if (status >= 500) {
      return this.createInternalError(status);
    }

    const exceptionResponse = exception.getResponse();
    const responseBody = this.isHttpExceptionBody(exceptionResponse)
      ? exceptionResponse
      : undefined;
    const rawMessage =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : responseBody?.message;
    const details = responseBody?.details?.length
      ? responseBody.details
      : Array.isArray(rawMessage)
        ? this.createValidationDetails(rawMessage)
        : undefined;

    return {
      status,
      code: this.getHttpErrorCode(status),
      message: this.getSafeHttpMessage(status, rawMessage),
      ...(details?.length ? { details } : {}),
    };
  }

  /**
   * 按 HTTP 状态映射稳定业务错误码。
   *
   * @param status HTTP 状态码。
   * @returns 对应的稳定业务错误码。
   */
  private getHttpErrorCode(status: HttpStatus): ApiErrorCode {
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return API_ERROR_CODES.AUTH_UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return API_ERROR_CODES.ACCESS_PERMISSION_DENIED;
      case HttpStatus.NOT_FOUND:
        return API_ERROR_CODES.COMMON_NOT_FOUND;
      case HttpStatus.CONFLICT:
        return API_ERROR_CODES.RESOURCE_CONFLICT;
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
      default:
        return API_ERROR_CODES.COMMON_VALIDATION_FAILED;
    }
  }

  /**
   * 生成可以安全展示的中文 HTTP 错误文案。
   *
   * DTO 校验的具体原因放入 details，顶层 message 保持稳定；其他自定义中文文案则予以保留。
   *
   * @param status HTTP 状态码。
   * @param rawMessage Nest 异常中的原始文案。
   * @returns 最终返回给调用方的中文文案。
   */
  private getSafeHttpMessage(
    status: HttpStatus,
    rawMessage: string | string[] | undefined,
  ): string {
    if (Array.isArray(rawMessage)) {
      return '请求参数校验失败';
    }

    if (rawMessage && this.containsChinese(rawMessage)) {
      return rawMessage;
    }

    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        return '身份认证失败，请重新登录';
      case HttpStatus.FORBIDDEN:
        return '您没有执行此操作的权限';
      case HttpStatus.NOT_FOUND:
        return '请求的资源不存在';
      case HttpStatus.CONFLICT:
        return '请求与当前资源状态冲突';
      case HttpStatus.UNPROCESSABLE_ENTITY:
      case HttpStatus.BAD_REQUEST:
      default:
        return '请求参数不正确';
    }
  }

  /**
   * 将 DTO 校验字符串转换为字段级错误详情。
   *
   * 支持主启动文件当前使用的 `字段路径: 错误原因` 格式；无法识别字段时仍会保留原始校验文案。
   *
   * @param messages DTO 校验错误文案列表。
   * @returns 结构化字段错误详情。
   */
  private createValidationDetails(messages: string[]): ApiErrorDetail[] {
    return messages.map((message) => {
      const match = /^([^:：]+)[:：]\s*(.+)$/.exec(message);

      if (!match) {
        return { message: this.translateValidationMessage(message) };
      }

      const field = match[1].trim();

      return {
        field,
        message: this.translateValidationMessage(match[2].trim(), field),
      };
    });
  }

  /**
   * 将 class-validator 的常见默认英文文案转换为中文。
   *
   * 未识别的英文校验文案使用统一中文兜底，避免直接把框架内部英文提示展示在中文页面。
   *
   * @param message 原始字段校验文案。
   * @param field 可选的字段路径，用于移除 class-validator 重复写入的字段名前缀。
   * @returns 面向调用方的中文字段校验文案。
   */
  private translateValidationMessage(message: string, field?: string): string {
    if (this.containsChinese(message)) {
      return message;
    }

    const normalizedMessage =
      field && message.startsWith(`${field} `)
        ? message.slice(field.length + 1)
        : message;
    const minimumLength =
      /must be longer than or equal to (\d+) characters?/i.exec(
        normalizedMessage,
      );
    const maximumLength =
      /must be shorter than or equal to (\d+) characters?/i.exec(
        normalizedMessage,
      );
    const minimumValue = /must not be less than (-?\d+(?:\.\d+)?)/i.exec(
      normalizedMessage,
    );
    const maximumValue = /must not be greater than (-?\d+(?:\.\d+)?)/i.exec(
      normalizedMessage,
    );
    const digitCount = /must be a (\d+) digit number/i.exec(normalizedMessage);
    const allowedValues = /must be one of the following values:\s*(.+)/i.exec(
      normalizedMessage,
    );

    if (/must be an email/i.test(normalizedMessage)) {
      return '必须是有效的邮箱地址';
    }
    if (/must be a string/i.test(normalizedMessage)) {
      return '必须是字符串';
    }
    if (/should not be empty/i.test(normalizedMessage)) {
      return '不能为空';
    }
    if (/must be an integer number/i.test(normalizedMessage)) {
      return '必须是整数';
    }
    if (/must be a boolean value/i.test(normalizedMessage)) {
      return '必须是布尔值';
    }
    if (/must be an array/i.test(normalizedMessage)) {
      return '必须是数组';
    }
    if (/must be a valid ISO 8601 date string/i.test(normalizedMessage)) {
      return '必须是有效的日期时间';
    }
    if (/must match .+ regular expression/i.test(normalizedMessage)) {
      return '格式不正确';
    }
    if (/property .+ should not exist/i.test(normalizedMessage)) {
      return '不允许提交该字段';
    }
    if (minimumLength) {
      return `长度不能少于 ${minimumLength[1]} 个字符`;
    }
    if (maximumLength) {
      return `长度不能超过 ${maximumLength[1]} 个字符`;
    }
    if (minimumValue) {
      return `不能小于 ${minimumValue[1]}`;
    }
    if (maximumValue) {
      return `不能大于 ${maximumValue[1]}`;
    }
    if (digitCount) {
      return `必须是 ${digitCount[1]} 位数字`;
    }
    if (allowedValues) {
      return `必须是允许的值之一：${allowedValues[1]}`;
    }

    return '字段值不符合校验要求';
  }

  /**
   * 创建统一且脱敏的服务端内部错误描述。
   *
   * @param status 可选的原始 5xx HTTP 状态，默认使用 500。
   * @returns 不包含内部异常信息的错误描述。
   */
  private createInternalError(
    status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
  ): ResolvedException {
    return {
      status,
      code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    };
  }

  /**
   * 按响应级别记录异常：4xx 使用 warn，5xx 使用 error 并保留服务端堆栈。
   *
   * @param exception 请求链路中抛出的原始异常。
   * @param request 当前 Express 请求。
   * @param requestId 当前请求唯一标识。
   * @param path 当前请求路径。
   * @param resolved 已归一化的异常描述。
   */
  private logException(
    exception: unknown,
    request: RequestWithContext,
    requestId: string,
    path: string,
    resolved: ResolvedException,
  ): void {
    const logMessage = `[${requestId}] [${request.method}] ${path} -> ${resolved.status} ${resolved.code} ${resolved.message}`;

    if (resolved.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : undefined,
      );
      return;
    }

    this.logger.warn(logMessage);
  }

  /**
   * 判断未知值是否为 Nest 常见 HTTP 异常响应体。
   *
   * @param value 待判断的未知值。
   * @returns value 是否为对象形式的 HTTP 异常响应。
   */
  private isHttpExceptionBody(value: unknown): value is HttpExceptionBody {
    return typeof value === 'object' && value !== null;
  }

  /**
   * 判断文案是否包含中文字符，用于避免把 Nest 默认英文错误直接暴露给中文页面。
   *
   * @param value 待判断文案。
   * @returns 文案中是否至少包含一个中文字符。
   */
  private containsChinese(value: string): boolean {
    return /[\u3400-\u9fff]/.test(value);
  }
}
