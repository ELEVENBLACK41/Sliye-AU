# src/app/api/

Next.js **Route Handlers（BFF API 层）**。

所有 `route.ts` 文件均运行在 **Node.js Server 侧**，对浏览器来说是本域接口（`/api/*`），对 NestJS 来说是内部服务消费方。浏览器**永不直接**访问 NestJS，实现跨域安全隔离。

## 目录结构

```
api/
└── test/
    ├── route.ts        # GET /api/test         → NestJS GET /test
    └── users/
        └── route.ts    # GET /api/test/users   → NestJS GET /test/users
```

## BFF 代理规范

每个 Route Handler 遵循统一的透传代理模式：

```ts
export async function GET() {
  const res = await fetch(`${process.env.NEST_BASE_URL}/xxx`)

  // 上游错误透传（保留 HTTP 状态码）
  if (!res.ok) {
    return Response.json(
      { code: res.status, message: 'Upstream error', data: null, timestamp: Date.now() },
      { status: res.status },
    )
  }

  // 正常响应直接透传，不再二次封装
  const data = await res.json()
  return Response.json(data)
}
```

> **关键原则**：NestJS 已通过 `TransformInterceptor` 统一封装响应体 `{ code, message, data, timestamp }`，BFF 层**直接透传**，不做二次包裹，避免双层嵌套。

## 环境变量

| 变量 | 用途 |
|---|---|
| `NEST_BASE_URL` | NestJS 内网地址，仅 Server 侧可读，不暴露给浏览器（无 `NEXT_PUBLIC_` 前缀） |

## 扩展指引

新增 BFF 接口只需在 `api/` 下创建对应目录和 `route.ts`：
```
api/
└── users/
    ├── route.ts          # GET/POST /api/users
    └── [id]/
        └── route.ts      # GET/PUT/DELETE /api/users/:id
```
