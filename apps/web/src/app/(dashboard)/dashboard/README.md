# src/app/(dashboard)/dashboard/

Dashboard 主页目录。

## 文件说明

### `page.tsx` — 用户列表页（数据库 seed 测试）

**路由**：`/dashboard`

**组件类型**：Server Component（RSC）——无 `'use client'` 指令，在服务端直接 `await` 获取数据。

**职责**：
- 在服务端调用 `getUsers()`，向 BFF `/api/test/users` 发起请求
- BFF 转发到 NestJS `GET /test/users`；若数据库无数据，NestJS 自动 seed 后返回
- 将返回的 `User[]` 渲染为卡片式列表

**渲染内容**：
| 区域 | 内容 |
|---|---|
| 用户行 | 首字母头像、姓名（可为空）、邮箱、ID |
| 文章列表 | 每篇文章的标题、内容摘要（line-clamp）、发布状态（绿点/灰点）|
| 空文章 | 显示「暂无文章」 |

**依赖**：
- `@/features/test` → `getUsers()` / `User` 类型
- Tailwind CSS 4 用于样式

**数据流**：
```
page.tsx (RSC)
  → getUsers() [features/test/services]
    → fetch('/api/test/users') [BFF Route Handler]
      → fetch(NEST_BASE_URL + '/test/users') [NestJS]
        → 数据库查询（自动 seed）
```
