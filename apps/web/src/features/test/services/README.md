# src/features/test/services/

**Test 特性数据请求层**——封装该特性所有与后端的数据交互。

## 文件说明

### `test.service.ts`

| 导出 | 签名 | 说明 |
|---|---|---|
| `getTest` | `() => Promise<ApiResponse<TestResponse>>` | 获取后端测试问候语 |
| `getUsers` | `() => Promise<ApiResponse<User[]>>` | 获取用户列表（含关联文章），数据库为空时自动 seed |

**实现原理**：

两个函数均基于 `@/services/request<T>()` 泛型封装：
```ts
export function getTest() {
  return request<ApiResponse<TestResponse>>('/api/test')
}

export function getUsers() {
  return request<ApiResponse<User[]>>('/api/test/users')
}
```

`request<T>` 使用 TypeScript 泛型来约束 `res.json()` 的返回类型，编译期即可捕获类型不匹配问题。

**调用方**：
- `src/app/page.tsx`：Server Component 中 `await getTest()`
- `src/app/(dashboard)/dashboard/page.tsx`：Server Component 中 `await getUsers()`

> 注意：在 Server Component 中调用时，`fetch` 目标地址是本机 Next.js server（`NEXT_PUBLIC_BASE_URL`），由 Next.js 内部解析，不经过浏览器。
