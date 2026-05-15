# src/app/(dashboard)/

Dashboard 路由分组。括号语法 `(dashboard)` 是 Next.js **Route Group**，目录名**不计入 URL 路径**，仅用于在文件系统层面聚合相关页面并共享同一个布局。

## 目录结构

```
(dashboard)/
├── layout.tsx      # Dashboard 共享布局
└── dashboard/
    └── page.tsx    # 页面 /dashboard
```

## 文件说明

### `layout.tsx` — Dashboard 区域布局

- 包裹所有 Dashboard 子页面的共享外层容器
- 当前为简单的 `<div>{children}</div>` 包装，预留位置用于后续添加：
  - 侧边导航栏（Sidebar）
  - 顶部导航栏（Topbar）
  - 面包屑导航
  - 权限校验逻辑
- **Server Component**

### `dashboard/page.tsx` — 用户列表页

- 路由：`/dashboard`
- **Server Component（RSC）**，在服务端直接调用 `getUsers()` 获取用户列表数据
- 展示用户卡片列表，每张卡片包含：
  - 用户头像（首字母）、姓名、邮箱、ID
  - 该用户关联的文章列表（标题、内容摘要、发布状态）
- 数据来源：通过 `@/features/test` 调用 BFF `/api/test/users`，BFF 再转发到 NestJS `/test/users`
- 若数据库为空，NestJS 会自动 seed 测试数据后再返回

## 扩展指引

新增 Dashboard 子页面只需在此分组下创建目录：
```
(dashboard)/
└── settings/
    └── page.tsx    # → /settings
```
该页面会自动复用 `(dashboard)/layout.tsx` 中的导航布局。
