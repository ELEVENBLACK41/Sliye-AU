/**
 * API 成功响应转换拦截器。
 *
 * Controller 和 Service 只返回真实业务数据，本拦截器负责补充统一成功响应外壳与 requestId。
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { ApiResponse } from '@workspace/contracts/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  API_SUCCESS_CODE,
  API_SUCCESS_MESSAGE,
} from '../constants/api-response.constants';
import {
  ensureRequestId,
  type RequestWithContext,
} from '../request-context/request-context';

export type { ApiResponse } from '@workspace/contracts/common';

/** 将控制器返回值包装为统一 API 成功响应。 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  /**
   * 包装控制器返回的真实业务数据，并保持响应 requestId 与请求上下文一致。
   *
   * @param context Nest 当前执行上下文。
   * @param next 后续请求处理器。
   * @returns 包含统一成功响应结构的 Observable。
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithContext>();
    const response = httpContext.getResponse<Response>();
    const requestId = ensureRequestId(request, response);

    return next.handle().pipe(
      map(
        (data: T): ApiResponse<T> => ({
          success: true,
          code: API_SUCCESS_CODE,
          message: API_SUCCESS_MESSAGE,
          data,
          timestamp: Date.now(),
          requestId,
        }),
      ),
    );
  }
}
