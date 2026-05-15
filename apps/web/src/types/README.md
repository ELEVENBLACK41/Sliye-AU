# src/types/

**全局 TypeScript 类型声明**——存放不属于任何特定业务特性、被多处引用的通用类型定义。

## 与特性类型的区别

| 位置 | 适合存放 |
|---|---|
| `src/types/`（此目录） | 全局公共类型：枚举值、全局工具类型、环境变量类型增强、跨特性共用实体 |
| `src/features/xxx/types/` | 某特性私有类型：只在该特性内部使用的接口和枚举 |

## 规划内容

| 文件 | 说明 |
|---|---|
| `global.d.ts` | 全局类型声明（扩展 `Window`、环境变量类型等） |
| `api.type.ts` | 通用 API 相关类型（分页响应 `Paginated<T>`、排序参数等） |
| `common.type.ts` | 通用工具类型（`Nullable<T>`、`Optional<T>`、`ID` 等） |
| `env.d.ts` | `process.env` 类型增强，让环境变量访问有 TS 提示 |

## 类型规范示例

```ts
// common.type.ts

/** 使任意类型的所有字段可为 null */
export type Nullable<T> = { [K in keyof T]: T[K] | null }

/** 主键 ID 类型（统一为 number，方便后续替换为 string/UUID） */
export type ID = number

/** 分页响应封装 */
export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
```

## 当前状态

目录已创建，类型文件待实现。现有文件：
- `role.md`（目录职责说明，一行标注）

> 特性专属类型（如 `User`、`Post`、`ApiResponse`）目前定义在 `features/test/types/`，后续如需跨特性共用，可迁移至此目录。
