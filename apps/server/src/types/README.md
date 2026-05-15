# src/types/ — 全局共享类型定义（待扩展）

本目录存放跨模块复用的 **TypeScript 类型、接口和枚举**定义，不包含任何运行时逻辑。

当前状态：`index.ts` 已创建，暂无内容，随项目演进逐步填充。

---

## 用途说明

将以下类型放入此目录集中管理：

| 类型 | 说明 |
|------|------|
| 全局响应体接口 | 如已在 `TransformInterceptor` 中定义的 `ApiResponse<T>` |
| 分页参数 / 分页结果类型 | `PaginationQuery`, `PaginatedResult<T>` |
| 用户角色枚举 | `UserRole.Admin`, `UserRole.User` 等 |
| JWT Payload 类型 | `JwtPayload` 接口 |
| 通用操作结果类型 | `OperationResult` |

---

## 规划示例

**`types/index.ts`**

```ts
// ——— 分页 ———
export interface PaginationQuery {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ——— 角色 ———
export enum UserRole {
  Admin = 'ADMIN',
  User  = 'USER',
}

// ——— JWT ———
export interface JwtPayload {
  sub: number;       // 用户 ID
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
```

---

## 注意事项

- 此目录仅放**类型定义**，不放类、装饰器或带有 NestJS IoC 逻辑的代码
- 若某个类型只在单一模块内使用，放在该模块目录下即可，不必提升至此
- 避免循环依赖：`types/` 不应 `import` 任何业务模块的内容
