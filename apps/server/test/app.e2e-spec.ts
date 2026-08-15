/**
 * 本文件执行不写入业务数据的 HTTP 端到端验证，覆盖公开健康检查与全局默认鉴权。
 */
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { API_ERROR_CODES, API_SUCCESS_CODE } from '@workspace/contracts/common';
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
} from '@workspace/contracts/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('权限体系 HTTP 链路（e2e）', () => {
  let app: INestApplication<App>;

  /** 启动与生产入口一致的 API 前缀、异常过滤器和响应拦截器。 */
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  it('公开健康检查应返回统一成功响应和 requestId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);
    const body = response.body as unknown as ApiSuccessResponse<{
      status: string;
      service: string;
    }>;
    const headers = response.headers as Record<string, string>;

    expect(body).toMatchObject({
      success: true,
      code: API_SUCCESS_CODE,
      data: { status: 'ok', service: 'nextnest-server' },
    });
    expect(body.requestId).toBeTruthy();
    expect(headers['x-request-id']).toBe(body.requestId);
  });

  it('未携带令牌访问新 Controller 时应被全局守卫统一拒绝', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/decisions')
      .expect(401);
    const body = response.body as unknown as ApiErrorResponse;

    expect(body).toMatchObject({
      success: false,
      code: API_ERROR_CODES.AUTH_UNAUTHORIZED,
      data: null,
      path: '/api/v1/decisions',
    });
    expect(body.requestId).toBeTruthy();
  });

  /** 关闭 Nest 应用与 Prisma 连接，不向数据库写入测试数据。 */
  afterAll(async () => {
    await app.close();
  });
});
