<!--
 * @Author: shaoliye
 * @Date: 2026-05-06 17:17:20
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-15 14:10:07
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
-->
# src/

Next.js 应用源码根目录，所有业务代码均位于此处。

## 目录概览1

| 目录 | 职责 |
|---|---|
| `app/` | App Router 路由：页面组件、布局、Server Actions、BFF API Routes |
| `components/` | 全局通用 UI 组件（Button、Input、Modal 等），**无任何业务逻辑** |
| `features/` | 按业务特性切分的模块，每个特性自包含（组件 + hooks + 状态 + 服务） |
| `hooks/` | 全局复用的 React Hooks，不含特定业务状态 |
| `lib/` | 工具函数、第三方库封装（日期格式化、加密、验证等） |
| `services/` | BFF HTTP 请求基础层（`fetch` 封装、统一错误处理） |
| `store/` | 全局客户端状态（跨特性共享，如当前用户会话、主题偏好） |
| `styles/` | 全局 CSS 样式和 CSS 变量 |
| `types/` | 全局 TypeScript 类型声明（不属于任何特性的公共类型） |

## 关键文件

| 文件 | 说明 |
|---|---|
| `proxy.ts` | Next.js 中间件（当前为透传直通，预留权限拦截、JWT 校验、路由守卫扩展点） |
| `next.config.js` | 旧版 JS 格式的 Next.js 配置草稿（实际生效配置在根目录 `next.config.ts`） |

## 分层规范

```
src/
├── app/          ← 路由层（只负责页面渲染和 BFF 转发）
├── features/     ← 特性层（业务逻辑全部在这里）
├── components/   ← UI 层（纯展示，可被任意层使用）
└── services/ store/ hooks/ lib/ styles/ types/
               ← 基础设施层（无业务依赖，可被所有层使用）
```

> **原则**：路由层依赖特性层；特性层依赖基础设施层；组件层不依赖任何业务层。
