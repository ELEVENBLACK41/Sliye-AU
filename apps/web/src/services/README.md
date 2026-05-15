# src/services/

**BFF HTTP 请求基础设施层**——封装 `fetch` 调用，提供统一的请求入口、错误处理和类型安全。

## 文件说明

### `request.ts` — 通用 HTTP 请求封装

核心导出函数：

```ts
export async function request<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T>
```

**职责**：
1. 拼接 `NEXT_PUBLIC_BASE_URL` 基础地址与路径
2. 透传 `RequestInit`（method、headers、body 等）
3. 检测 `res.ok`，非 2xx 时抛出 `Error('Request error: ${status}')`
4. 将 `res.json()` 强转为泛型 `T`，消除手动 `as` 断言

**环境变量**：
- `NEXT_PUBLIC_BASE_URL`：请求基础地址，客户端/服务端均可访问（带 `NEXT_PUBLIC_` 前缀）

**使用示例**：
```ts
// features/test/services/test.service.ts
import { request } from '@/services/request'

export function getUsers() {
  return request<ApiResponse<User[]>>('/api/test/users')
}
```

**错误处理策略**：
- 网络错误：`fetch` 本身抛出 `TypeError`，调用方捕获处理
- HTTP 错误：`request` 抛出 `Error('Request error: 500')`，调用方捕获处理
- 业务错误：由调用方解析 `res.data`、`res.code` 字段自行判断

## 扩展规划

预计扩展内容：
```ts
// 支持 token 自动注入
request('/api/users', {
  headers: { Authorization: `Bearer ${token}` }
})

// 支持请求超时
request('/api/slow', { signal: AbortSignal.timeout(5000) })
```

## 与 BFF Route Handlers 的关系

```
浏览器/RSC → request('/api/xxx') → Next.js Route Handler → NestJS
```

`services/request.ts` 只发请求到 `/api/*`（本机 Next.js），**不直接访问 NestJS**。NestJS 地址（`NEST_BASE_URL`）只存在于 BFF Route Handlers 中，不暴露给客户端。
