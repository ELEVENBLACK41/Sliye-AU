# src/common/ — 公共基础设施层

本目录存放与业务无关、可被所有模块复用的基础设施代码，包含 NestJS 五大横切关注点：**拦截器、过滤器、守卫、管道、装饰器**，以及通用工具函数。

---

## 目录说明

```
common/
├── interceptors/   # 拦截器：处理请求 / 响应的横切逻辑
├── filters/        # 异常过滤器：统一捕获和格式化异常响应
├── guards/         # 守卫：路由访问控制（认证 / 权限）[待扩展]
├── pipes/          # 管道：入参校验与类型转换 [待扩展]
├── decorators/     # 自定义装饰器 [待扩展]
└── utils/          # 纯函数工具库 [待扩展]
```

---

## interceptors/ — 拦截器

### `transform.interceptor.ts` — 统一响应格式拦截器

**作用**：将所有 Controller 方法的返回值自动包装为标准响应体。

**包装格式**：

```json
{
  "code": 0,
  "message": "success",
  "data": <原始返回值>,
  "timestamp": 1778041000929
}
```

**注册方式**：在 `main.ts` 中全局注册，作用于所有接口：

```ts
app.useGlobalInterceptors(new TransformInterceptor());
```

**泛型设计**：

```ts
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
>
```

`ApiResponse<T>` 接口也在此文件中导出，供前端类型系统复用：

```ts
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}
```

---

## filters/ — 异常过滤器

### `all-exceptions.filter.ts` — 全局异常过滤器

**作用**：捕获应用中所有未处理的异常（HTTP 异常和非 HTTP 异常），统一格式化为错误响应，防止裸堆栈信息泄露给用户。

**响应格式**：

```json
{
  "code": 404,
  "message": "Cannot GET /xxx",
  "data": null,
  "timestamp": 1778041000929
}
```

**异常处理逻辑**：

| 异常类型 | `code` 取值 | `message` 取值 |
|---------|-------------|----------------|
| `HttpException`（NestJS 标准异常） | `exception.getStatus()` | 响应体中的 `message` 字段 |
| 其他未知异常（数据库错误等） | `500` | `'Internal server error'` |

**注册方式**：在 `main.ts` 中全局注册，**必须先于 Interceptor 注册**：

```ts
app.useGlobalFilters(new AllExceptionsFilter());
app.useGlobalInterceptors(new TransformInterceptor());
```

**日志记录**：使用 NestJS 内置 `Logger` 记录每条异常，格式为：

```
[ERROR] AllExceptionsFilter [GET] /xxx → 404 Not Found
```

---

## guards/ — 守卫（待扩展）

**预期用途**：路由访问控制，典型场景：

- `JwtAuthGuard`：验证 JWT token，保护需要登录的接口
- `RolesGuard`：基于用户角色的权限控制

**扩展参考**：

```ts
// 使用方式：@UseGuards(JwtAuthGuard)
// 或全局注册：app.useGlobalGuards(new JwtAuthGuard())
```

---

## pipes/ — 管道（待扩展）

**预期用途**：请求入参的校验与转换，典型场景：

- `ValidationPipe`：配合 `class-validator` 校验 DTO
- `ParseIntPipe`：将字符串路由参数转换为整数

**推荐全局配置**（添加到 `main.ts`）：

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,        // 剔除未声明字段
    forbidNonWhitelisted: true,  // 存在额外字段时直接报错
    transform: true,        // 自动类型转换
  }),
);
```

---

## decorators/ — 自定义装饰器（待扩展）

**预期用途**：提取常用元数据，简化 Controller 代码，典型场景：

- `@CurrentUser()`：从 JWT 中提取当前登录用户
- `@Roles(...roles)`：声明接口所需角色

---

## utils/ — 工具函数（待扩展）

**预期用途**：纯函数工具，不依赖任何 NestJS 上下文，典型场景：

- 分页参数计算
- 密码加密 / 对比
- 时间格式化
