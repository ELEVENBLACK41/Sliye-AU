/*
 * @Author: shaoliye
 * @Date: 2026-05-06 00:00:00
 * @Description: 统一响应体拦截器，将所有接口返回值包装为标准格式
 *               { code: 0, message: 'success', data: T, timestamp: number }
 * @Copyright: Copyright 1990 - 2026
 */
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'success',
        data,
        timestamp: Date.now(),
      })),
    );
  }
}
