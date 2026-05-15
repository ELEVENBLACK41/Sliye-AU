# src/app/

Next.js **App Router** 路由根目录。遵循 Next.js 约定式路由，文件即路由。

## 目录结构

```
app/
├── layout.tsx          # 根布局（HTML 骨架、字体、全局样式）
├── page.tsx            # 首页 /
├── (dashboard)/        # 路由分组（Dashboard 相关页面）
│   ├── layout.tsx      # Dashboard 区域布局
│   └── dashboard/
│       └── page.tsx    # 页面 /dashboard
└── api/                # BFF API Routes（Server 侧代理）
    └── test/
        ├── route.ts    # GET /api/test
        └── users/
            └── route.ts  # GET /api/test/users
```

## 文件说明

### `layout.tsx` — 根布局

- 整个应用的 HTML 骨架，设置 `<html>`、`<body>` 标签
- 注册全局字体：**Geist Sans**（正文）、**Geist Mono**（代码）
- 导入全局 CSS（`styles/globals.css`）
- 设置 SEO 元数据（`metadata` export）
- **Server Component**，不包含任何客户端逻辑

### `page.tsx` — 首页

- 路由：`/`
- **Server Component**，在服务端直接调用 `getTest()` 获取后端数据并渲染
- 展示 Next.js 默认欢迎页（含跳转 Dashboard 的按钮）
- 预留了后续改造为正式首页的位置

## 路由分组 `(dashboard)/`

括号包裹的目录名是 **路由分组**，`(dashboard)` 不会出现在 URL 中，仅用于：
1. 共享同一个 `layout.tsx`（Dashboard 区域布局）
2. 在目录结构上将 Dashboard 相关页面聚合在一起

## API Routes（BFF 层）

`api/` 下的 `route.ts` 文件是 Next.js **Route Handlers**，运行在 Node.js Server 侧，作为 BFF 代理层将请求转发至 NestJS 后端，浏览器不直接访问 NestJS。

> 详见 [`api/README.md`](api/README.md)
