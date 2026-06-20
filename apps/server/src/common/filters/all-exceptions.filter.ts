/*
 * @Author: shaoliye
 * @Date: 2026-05-06 00:00:00
 * @Description: 全局 HTTP 异常过滤器，统一异常响应格式
 *               { code: httpStatus, message: string, data: null, timestamp: number }
 * @Copyright: Copyright 1990 - 2026
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { API_ERROR_DATA } from '../constants/api-response.constants';

type HttpExceptionBody = {
  message?: string | string[];
  error?: string;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  // 捕获所有异常并转换为统一 HTTP 响应结构。
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.getMessage(exception);

    this.logger.error(
      `[${request.method}] ${request.url} → ${status} ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      code: status,
      message,
      data: API_ERROR_DATA,
      timestamp: Date.now(),
    });
  }

  // 从 Nest 标准异常体中提取面向调用方的错误文案。
  private getMessage(exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }

    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (this.isHttpExceptionBody(response)) {
      const { message, error } = response;

      if (Array.isArray(message)) {
        return message.join('; ');
      }

      return message ?? error ?? exception.message;
    }

    return exception.message;
  }

  // 判断异常响应是否是 Nest 常见的对象格式。
  private isHttpExceptionBody(value: unknown): value is HttpExceptionBody {
    return typeof value === 'object' && value !== null;
  }
}
