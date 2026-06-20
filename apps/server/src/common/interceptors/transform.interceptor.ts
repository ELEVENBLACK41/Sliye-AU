/*
 * @Author: shaoliye
 * @Date: 2026-05-25 17:59:15
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-25 18:03:52
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { ApiResponse } from '@workspace/contracts/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  API_SUCCESS_CODE,
  API_SUCCESS_MESSAGE,
} from '../constants/api-response.constants';

export type { ApiResponse } from '@workspace/contracts/common';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  // 将控制器返回值统一包装成标准 API 响应体。
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: T) => ({
        code: API_SUCCESS_CODE,
        message: API_SUCCESS_MESSAGE,
        data,
        timestamp: Date.now(),
      })),
    );
  }
}
