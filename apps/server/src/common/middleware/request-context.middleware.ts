/**
 * HTTP 请求上下文中间件。
 *
 * 该中间件负责尽早确定 requestId，并通过 AsyncLocalStorage 将其传递给同一请求内的日志和审计逻辑。
 */

import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import {
  ensureRequestId,
  runWithRequestContext,
  type RequestWithContext,
} from '../request-context/request-context';

/** 为 HTTP 请求建立 requestId 异步上下文的 Nest 中间件。 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  /**
   * 初始化请求上下文后继续执行后续中间件和业务逻辑。
   *
   * @param request 当前 Express 请求。
   * @param response 当前 Express 响应。
   * @param next Express 后续处理函数。
   */
  use(
    request: RequestWithContext,
    response: Response,
    next: NextFunction,
  ): void {
    const requestId = ensureRequestId(request, response);

    runWithRequestContext({ requestId }, next);
  }
}
