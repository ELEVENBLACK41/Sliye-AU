/**
 * 全局异常过滤器单元测试。
 *
 * 覆盖业务异常、Nest HTTP 异常、DTO 校验异常、Prisma 常见异常、未知异常和分级日志行为。
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client-runtime-utils';
import {
  API_ERROR_CODES,
  type ApiErrorResponse,
} from '@workspace/contracts/common';
import type { Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import type { RequestWithContext } from '../request-context/request-context';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** 异常过滤器执行测试时捕获的结果。 */
interface FilterExecutionResult {
  /** 过滤器最终写入的 HTTP 状态码。 */
  status: number;
  /** 过滤器最终写入的统一错误响应体。 */
  body: ApiErrorResponse;
  /** 过滤器最终写入的响应头。 */
  headers: Record<string, string>;
}

/**
 * 使用最小 Express/Nest 测试替身执行一次异常过滤器。
 *
 * @param exception 需要交给过滤器处理的异常。
 * @param requestHeaders 可选的原始请求头。
 * @returns 过滤器写入的状态、响应体和响应头。
 */
function executeFilter(
  exception: unknown,
  requestHeaders: Record<string, string> = {},
): FilterExecutionResult {
  let capturedStatus = 0;
  let capturedBody: unknown;
  const capturedHeaders: Record<string, string> = {};
  const responseDouble = {
    setHeader(name: string, value: string | number | readonly string[]): void {
      capturedHeaders[name] = String(value);
    },
    status(status: number): typeof responseDouble {
      capturedStatus = status;
      return responseDouble;
    },
    json(body: unknown): typeof responseDouble {
      capturedBody = body;
      return responseDouble;
    },
  };
  const requestDouble = {
    headers: requestHeaders,
    method: 'GET',
    originalUrl: '/api/v1/test',
    url: '/api/v1/test',
  } as unknown as RequestWithContext;
  const hostDouble = {
    switchToHttp: () => ({
      getRequest: () => requestDouble,
      getResponse: () => responseDouble as unknown as Response,
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, hostDouble);

  if (!capturedBody || typeof capturedBody !== 'object') {
    throw new Error('异常过滤器没有写入响应体');
  }

  return {
    status: capturedStatus,
    body: capturedBody as ApiErrorResponse,
    headers: capturedHeaders,
  };
}

describe('AllExceptionsFilter', () => {
  let loggerWarnSpy: jest.SpiedFunction<Logger['warn']>;
  let loggerErrorSpy: jest.SpiedFunction<Logger['error']>;

  beforeEach(() => {
    loggerWarnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('应保留业务异常的稳定业务码、中文文案和字段详情', () => {
    const result = executeFilter(
      new BusinessException({
        status: HttpStatus.CONFLICT,
        code: API_ERROR_CODES.DEPARTMENT_CODE_CONFLICT,
        message: '部门编码已存在',
        details: [{ field: 'code', message: '请更换部门编码' }],
      }),
    );

    expect(result.status).toBe(HttpStatus.CONFLICT);
    expect(result.body).toMatchObject({
      success: false,
      code: API_ERROR_CODES.DEPARTMENT_CODE_CONFLICT,
      message: '部门编码已存在',
      data: null,
      path: '/api/v1/test',
      details: [{ field: 'code', message: '请更换部门编码' }],
    });
    expect(result.body.requestId).toBeTruthy();
    expect(result.headers['x-request-id']).toBe(result.body.requestId);
  });

  it('应将 DTO 校验字符串转换为字段级详情', () => {
    const result = executeFilter(
      new BadRequestException([
        'email: 邮箱格式不正确',
        'profile.name: 姓名不能为空',
        'title: title must be longer than or equal to 2 characters',
      ]),
    );

    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
    expect(result.body).toMatchObject({
      code: API_ERROR_CODES.COMMON_VALIDATION_FAILED,
      message: '请求参数校验失败',
      details: [
        { field: 'email', message: '邮箱格式不正确' },
        { field: 'profile.name', message: '姓名不能为空' },
        { field: 'title', message: '长度不能少于 2 个字符' },
      ],
    });
  });

  it.each([
    [
      new UnauthorizedException(),
      HttpStatus.UNAUTHORIZED,
      API_ERROR_CODES.AUTH_UNAUTHORIZED,
      '身份认证失败，请重新登录',
    ],
    [
      new ForbiddenException(),
      HttpStatus.FORBIDDEN,
      API_ERROR_CODES.ACCESS_PERMISSION_DENIED,
      '您没有执行此操作的权限',
    ],
    [
      new NotFoundException(),
      HttpStatus.NOT_FOUND,
      API_ERROR_CODES.COMMON_NOT_FOUND,
      '请求的资源不存在',
    ],
    [
      new ConflictException(),
      HttpStatus.CONFLICT,
      API_ERROR_CODES.RESOURCE_CONFLICT,
      '请求与当前资源状态冲突',
    ],
  ])(
    '应将常见 Nest HTTP 异常映射为稳定业务码',
    (exception, status, code, message) => {
      const result = executeFilter(exception);

      expect(result.status).toBe(status);
      expect(result.body.code).toBe(code);
      expect(result.body.message).toBe(message);
    },
  );

  it.each([
    [
      'P2002',
      HttpStatus.CONFLICT,
      API_ERROR_CODES.RESOURCE_CONFLICT,
      '数据已存在，请勿重复提交',
    ],
    [
      'P2003',
      HttpStatus.CONFLICT,
      API_ERROR_CODES.RESOURCE_CONFLICT,
      '当前数据仍被其他记录引用，无法完成操作',
    ],
    [
      'P2025',
      HttpStatus.NOT_FOUND,
      API_ERROR_CODES.COMMON_NOT_FOUND,
      '请求的资源不存在',
    ],
  ])('应映射常见 Prisma 已知请求异常', (prismaCode, status, code, message) => {
    const result = executeFilter(
      new PrismaClientKnownRequestError('数据库内部错误', {
        code: prismaCode,
        clientVersion: '7.8.0',
      }),
    );

    expect(result.status).toBe(status);
    expect(result.body.code).toBe(code);
    expect(result.body.message).toBe(message);
  });

  it('应对未知异常返回中文脱敏 500 响应', () => {
    const result = executeFilter(new Error('包含数据库地址的内部异常'));

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body).toMatchObject({
      success: false,
      code: API_ERROR_CODES.COMMON_INTERNAL_ERROR,
      message: '服务器内部错误，请稍后重试',
      data: null,
    });
    expect(JSON.stringify(result.body)).not.toContain('数据库地址');
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it('应对 4xx 使用 warn 日志且复用安全的上游 requestId', () => {
    const result = executeFilter(new NotFoundException(), {
      'x-request-id': 'upstream-request_123',
    });

    expect(result.body.requestId).toBe('upstream-request_123');
    expect(loggerWarnSpy).toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });
});
