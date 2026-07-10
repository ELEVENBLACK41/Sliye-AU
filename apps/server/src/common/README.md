# `src/common` 公共基础设施

本目录存放不依赖具体业务模块的 NestJS 横切能力。业务 Service 只返回真实数据或抛出业务异常，成功响应包装、错误归一化、requestId 和日志分级均在这里统一处理。

## 目录说明

```text
common/
├── constants/        # contracts 业务码转发与服务端默认文案
├── exceptions/       # 带稳定业务码的 BusinessException
├── filters/          # 全局异常捕获、映射、脱敏与日志
├── interceptors/     # 成功响应统一包装
├── middleware/       # HTTP 请求上下文初始化
└── request-context/  # requestId 与 AsyncLocalStorage 工具
```

## 统一成功响应

`TransformInterceptor` 将 Controller 返回的真实业务数据包装为：

```json
{
  "success": true,
  "code": "COMMON.OK",
  "message": "请求成功",
  "data": {},
  "timestamp": 1783700000000,
  "requestId": "e4f23948-c6a4-4c27-8bcb-86780cde2bf4"
}
```

`code` 和 `ApiResponse<T>` 均来自 `@workspace/contracts/common`，服务端不得自行维护另一套业务码。

## 统一错误响应

`AllExceptionsFilter` 将业务异常、Nest HTTP 异常、DTO 校验错误和常见 Prisma 异常统一转换为：

```json
{
  "success": false,
  "code": "COMMON.VALIDATION_FAILED",
  "message": "请求参数校验失败",
  "data": null,
  "details": [
    {
      "field": "email",
      "message": "必须是有效的邮箱地址"
    }
  ],
  "timestamp": 1783700000000,
  "requestId": "e4f23948-c6a4-4c27-8bcb-86780cde2bf4",
  "path": "/api/v1/auth/login"
}
```

主要映射规则：

| 异常                     |  HTTP 状态 | 业务码                     |
| ------------------------ | ---------: | -------------------------- |
| DTO 校验、400、422       | 400 或 422 | `COMMON.VALIDATION_FAILED` |
| 未认证                   |        401 | `AUTH.UNAUTHORIZED`        |
| 无权限                   |        403 | `ACCESS.PERMISSION_DENIED` |
| 资源不存在               |        404 | `COMMON.NOT_FOUND`         |
| 资源冲突                 |        409 | `RESOURCE.CONFLICT`        |
| Prisma `P2002` / `P2003` |        409 | `RESOURCE.CONFLICT`        |
| Prisma `P2025`           |        404 | `COMMON.NOT_FOUND`         |
| 未知异常                 |        500 | `COMMON.INTERNAL_ERROR`    |

4xx 使用 `warn` 记录，5xx 使用 `error` 并在服务端保留堆栈。任何 5xx 响应都只返回统一中文文案，不会向浏览器泄露数据库、路径或堆栈信息。

## 抛出业务异常

业务 Service 使用 `BusinessException` 声明稳定业务码，Controller 不应手工拼接错误响应：

```ts
throw new BusinessException({
  status: HttpStatus.CONFLICT,
  code: API_ERROR_CODES.DEPARTMENT_DISABLED,
  message: '目标部门已停用',
  details: [{ field: 'departmentId', message: '请选择启用中的部门' }],
});
```

`cause` 可以保留原始异常因果链，但不会进入响应体。

## requestId 请求上下文

`RequestContextMiddleware` 会优先复用长度不超过 64 且只包含安全字符的 `x-request-id`；无效或缺失时生成 UUID。最终 requestId 同时写入：

- Express 请求对象；
- `x-request-id` 响应头；
- 成功或失败响应体；
- AsyncLocalStorage 请求上下文，供日志和授权审计读取。

中间件应在根模块统一接入：

```ts
consumer.apply(RequestContextMiddleware).forRoutes('*');
```

即使中间件暂未接入，拦截器和异常过滤器也会调用 `ensureRequestId`，保证所有 API 响应都有 requestId；但需要异步上下文的审计逻辑仍依赖中间件。

## 全局注册

应用需要全局注册异常过滤器、DTO 校验管道和成功响应拦截器：

```ts
app.useGlobalFilters(new AllExceptionsFilter());
app.useGlobalPipes(new ValidationPipe(/* ... */));
app.useGlobalInterceptors(new TransformInterceptor());
```
