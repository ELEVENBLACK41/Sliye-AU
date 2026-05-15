# src/features/test/types/

**Test 特性 TypeScript 类型定义**。

## 文件说明

### `test.type.ts`

#### `ApiResponse<T>` — 统一响应体泛型

```ts
export interface ApiResponse<T> {
  code: number       // 0 = 成功；HTTP 状态码 = 失败
  message: string    // 'success' | 错误描述
  data: T            // 实际业务数据
  timestamp: number  // 服务端返回时间戳（ms）
}
```

与 NestJS `TransformInterceptor` 输出结构完全对齐，是前后端类型契约的体现。

#### `TestResponse` — /test 接口数据体

```ts
export interface TestResponse {
  msg: string        // 示例："Hello World!"
}
```

#### `User` — 用户实体

```ts
export interface User {
  id: number
  email: string
  name: string | null   // 用户名可为空
  posts: Post[]         // 关联的文章列表
}
```

#### `Post` — 文章实体

```ts
export interface Post {
  id: number
  title: string
  content: string | null    // 正文可为空
  published: boolean | null // 是否发布，null 视为草稿
}
```

## 类型同步说明

这些类型需与 `server/prisma/schema.prisma` 中的 `User`、`Post` 模型字段保持一致。当后端 schema 变更后，前端类型也需同步更新。后续可考虑通过 **tRPC** 或 **OpenAPI 代码生成** 实现自动同步。
