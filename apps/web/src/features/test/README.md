# src/features/test/

**Test 特性模块**——演示端到端数据流的示例模块，涵盖「BFF 代理 → NestJS → 数据库 → 自动 seed → 前端渲染」完整链路。

## 目录结构

```
test/
├── index.ts            # 模块公开 API（对外导出入口）
├── services/
│   └── test.service.ts # 调用 BFF 的数据请求函数
└── types/
    └── test.type.ts    # 该特性的 TypeScript 类型定义
```

## 文件说明

### `index.ts` — 模块入口

统一导出本模块所有公开内容，外部只允许从这里导入：

```ts
export * from './services/test.service'   // getTest, getUsers
export * from './types/test.type'         // ApiResponse, TestResponse, User, Post
```

### `services/test.service.ts` — 数据请求

| 函数 | 说明 |
|---|---|
| `getTest()` | 请求 `GET /api/test`，返回 `ApiResponse<TestResponse>` |
| `getUsers()` | 请求 `GET /api/test/users`，返回 `ApiResponse<User[]>` |

两个函数均调用 `@/services/request` 的通用 `request<T>()` 封装，类型安全，无需手动断言。

### `types/test.type.ts` — 类型定义

| 类型 | 说明 |
|---|---|
| `ApiResponse<T>` | 统一后端响应体结构：`{ code, message, data: T, timestamp }` |
| `TestResponse` | `/test` 接口数据体：`{ msg: string }` |
| `User` | 用户实体：`{ id, email, name, posts[] }` |
| `Post` | 文章实体：`{ id, title, content, published }` |

`ApiResponse<T>` 与 NestJS `TransformInterceptor` 的响应结构一一对应，保持前后端类型同步。

## 数据流

```
features/test/services/test.service.ts
  ↓ request('/api/test/users')
src/services/request.ts（fetch 封装）
  ↓ fetch('/api/test/users')
src/app/api/test/users/route.ts（BFF Route Handler）
  ↓ fetch(NEST_BASE_URL + '/test/users')
server NestJS GET /test/users
  ↓ 数据库查询（自动 seed）
  ↑ { code: 0, message: 'success', data: User[], timestamp }
```
