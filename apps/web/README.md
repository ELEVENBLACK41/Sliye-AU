# Web 前端

> 技术栈：Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · pnpm

企业级后台管理系统前端。规划目标：
- **权限策略引擎**：接口权限颗粒化到按钮级别、埋点
- **审计引擎**：谁在什么时候对哪个数据做了什么操作，操作前后数据 diff，支持回滚（undo）
- **任务调度**：定时任务、异步任务、重试机制、发邮件、数据同步、报表生成
- **实时通知**：WebSocket 推送（审批流更新、在线状态）
- **AI 辅助**：AI 决策、SSE 流式传输
- 充分利用 Next.js **SSR / RSC** 能力

当前处于基础架构搭建阶段。

---

## 项目结构

```
web/
├── src/
│   ├── app/            # Next.js App Router（页面 + BFF API Routes）
│   ├── components/     # 全局通用 UI 组件（无业务逻辑）
│   ├── features/       # 业务特性模块（按功能域切分）
│   ├── hooks/          # 全局通用自定义 Hooks
│   ├── lib/            # 工具库 / 第三方封装
│   ├── services/       # BFF HTTP 请求基础设施
│   ├── store/          # 全局状态管理（跨模块）
│   ├── styles/         # 全局样式
│   └── types/          # 全局 TypeScript 类型
├── public/             # 静态资源
├── next.config.ts      # Next.js 配置
├── postcss.config.mjs  # PostCSS / Tailwind 配置
├── tsconfig.json       # TypeScript 配置
└── package.json        # 依赖清单 & 脚本
```

---

## 启动开发

```bash
pnpm dev          # 启动开发服务器 → http://localhost:3000
pnpm build        # 生产构建
pnpm start        # 启动生产服务
pnpm lint         # ESLint 检查
```

> 后端 NestJS 服务需同时运行在 `http://localhost:3001`，BFF 访问地址默认包含 `/api/v1` 前缀（见 `server/` 目录）。

---

## 架构设计

### BFF（Backend For Frontend）模式

Next.js API Routes 作为 BFF 层，**浏览器页面只访问 `/api/*`，不直接调用 NestJS**，保持跨域安全隔离。

```
浏览器 → Next.js /api/*（Server 侧）→ NestJS :3001/api/v1
```

### 目录分层原则

| 层 | 目录 | 说明 |
|---|---|---|
| 路由层 | `app/` | 页面、布局、BFF 接口 |
| 特性层 | `features/` | 按业务域聚合（组件 + hooks + 状态 + 服务） |
| 基础设施 | `services/` `store/` `hooks/` `lib/` | 与业务无关的通用能力 |
| 全局 UI | `components/` | 纯 UI，无业务耦合 |

---

## 环境变量

| 变量 | 说明 | 示例值 |
|---|---|---|
| `NEST_BASE_URL` | NestJS 服务地址（BFF Server 侧使用，不暴露给浏览器） | `http://localhost:3001` |
| `NEST_API_PREFIX` | BFF 请求 NestJS 时拼接的 API 前缀，默认 `api/v1` | `api/v1` |
| `NEXT_PUBLIC_BASE_URL` | 浏览器可见基础 URL（用于客户端 fetch） | `http://localhost:3000` |
