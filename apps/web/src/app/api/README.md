# src/app/api

这里是 Next.js Route Handlers，也就是本项目的 BFF API 层。

## 这一层负责什么

浏览器只请求 Next.js 自己的 `/api/*`，不直接请求 NestJS。

```text
Client Component / Server Component
  -> apps/web/src/services/request.ts
  -> apps/web/src/app/api/**/route.ts
  -> apps/web/src/features/**/services/*-bff.service.ts
  -> NestJS API
```

这层主要做四件事：

1. 隐藏后端地址：`NEST_BASE_URL` 只能在服务端读，不能暴露给浏览器。
2. 统一入口：前端永远调用同域 `/api/*`，避免跨域和环境切换问题。
3. 处理 Web 层状态：比如登录成功后把 token 写进 `httpOnly` Cookie，退出时删除 Cookie。
4. 做轻量校验和适配：检查必填参数、裁剪敏感字段、把 Nest 响应透传给页面。

## 这一层不该做什么

不要把复杂业务逻辑写在 `route.ts` 里。大厂项目里一般也会把 BFF 控制在“编排层”，真正的业务规则放到后端服务，原因是：

| 事情 | 放哪里 | 原因 |
| --- | --- | --- |
| 字段必填、格式校验 | `route.ts` 可以做第一层 | 快速拒绝明显非法请求 |
| Cookie、Header、Session 处理 | `route.ts` | 这是 Web/BFF 层职责 |
| 请求 Nest、解析 Nest 响应 | `features/*/services/*-bff.service.ts` | 避免每个 API 文件重复 fetch |
| 权限、事务、数据库写入 | NestJS | 保证多端复用，避免 Web 端和后端规则分裂 |
| React 页面状态 | `features/*/components` | API 层不关心 UI 状态 |

## 目录规范

URL 和目录保持一致：

```text
api/
  auth/
    login/
      route.ts                # POST /api/auth/login -> Nest POST {NEST_BASE_URL}/auth/login
    logout/
      route.ts                # POST /api/auth/logout -> Nest POST {NEST_BASE_URL}/auth/logout
    register/
      route.ts                # POST /api/auth/register -> Nest POST {NEST_BASE_URL}/auth/register
```

新增接口时优先按业务模块分组，比如：

```text
api/
  decisions/
    route.ts                  # GET/POST /api/decisions
    [id]/
      route.ts                # GET/PATCH/DELETE /api/decisions/:id
```

## 代码写法规范

### 普通代理接口

普通接口尽量保持薄，只做转发：

```ts
export async function GET() {
  const upstream = await requestSomethingFromNest()

  return NextResponse.json(upstream.body, {
    status: upstream.status,
  })
}
```

### 需要 Web 状态的接口

登录、退出这类接口可以处理 Cookie，但不要把 token 返回给浏览器 JS。

```ts
const responseBody = upstream.body.data
  ? {
      ...upstream.body,
      data: {
        user: upstream.body.data.user,
      },
    }
  : upstream.body
```

这段意思是：Nest 可以返回 token 给 BFF，但 BFF 只把 `user` 给页面，token 写入 `httpOnly` Cookie。

### 错误返回

保持统一响应格式：

```ts
{
  code: number
  message: string
  data: null
  timestamp: number
}
```

HTTP 状态码和业务 `code` 都要保留。前端 `requestData()` 会判断 `code !== 0` 并抛错给页面。

不要在每个 `route.ts` 里手写这段结构，统一使用 `app/api/_utils/response.ts`：

```ts
return apiError({ status: 400, message: "请输入有效邮箱" })
return apiErrorFromUnknown(error, "登录失败，请稍后再试", 401)
return upstreamError(res.status)
```

## 和大厂常见做法对照

这个项目现在采用的是“轻 BFF”模式，和很多中大型前端团队类似：

| 大厂常见做法 | 本项目对应做法 |
| --- | --- |
| 浏览器请求同域 BFF，不直接请求后端服务 | 浏览器只请求 `/api/*` |
| 服务端环境变量不加 `NEXT_PUBLIC_` | `NEST_BASE_URL` / `NEST_API_PREFIX` 只在 Route Handler/BFF service 读取 |
| API 文件只做校验、鉴权、编排 | `route.ts` 保持薄，转发逻辑下沉到 `*-bff.service.ts` |
| token 不放 localStorage | access/refresh token 写入 `httpOnly` Cookie |
| 统一响应结构和错误处理 | Nest 返回 `{ code, message, data, timestamp }`，Web 用 `requestData()` 消费 |
| 重要逻辑后端兜底 | 权限、事务、数据写入放 NestJS |

## 新增接口 checklist

1. 在 `features/xxx/types` 里定义请求和响应类型。
2. 在 `features/xxx/services/xxx-bff.service.ts` 里封装请求 Nest 的函数。
3. 在 `app/api/xxx/**/route.ts` 里做轻量校验、调用 BFF service、返回 `NextResponse.json()`。
4. 如果浏览器页面要调用，在 `features/xxx/services/xxx-client.service.ts` 里用 `requestData()` 封装。
5. 跑 `pnpm --filter @nextnest/web lint` 和 `pnpm --filter @nextnest/web build`。

## 当前链路示例

登录：

```text
LoginForm
  -> auth-client.service.ts login()
  -> requestData("/api/auth/login")
  -> app/api/auth/login/route.ts
  -> auth-bff.service.ts requestLoginFromNest()
  -> NestJS POST {NEST_BASE_URL}/auth/login
  -> BFF 写入 httpOnly Cookie
  -> 页面只拿到 user
```
