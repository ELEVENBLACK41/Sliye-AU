# src/store/

**全局客户端状态**——存放跨模块、与特定业务特性无关的全局状态，如用户会话、UI 主题偏好、语言设置等。

## 与 `src/features/store/` 的区别

| 维度 | `src/store/`（此目录） | `src/features/store/` |
|---|---|---|
| 内容性质 | 全局基础设施状态（主题、语言、会话） | 跨特性的业务状态（通知、权限、审批队列） |
| 业务耦合 | **无** | **有** |
| 生命周期 | 应用级，始终存在 | 随业务功能启用而激活 |
| 示例 | `themeStore`、`i18nStore`、`sessionStore` | `notificationStore`、`permissionStore` |

## 规划内容

| Store | 说明 |
|---|---|
| `sessionStore` | 当前登录用户信息（id、name、avatar、token），登录后写入，退出时清空 |
| `themeStore` | 明/暗主题设置，持久化到 localStorage |
| `i18nStore` | 当前语言（zh-CN / en-US），持久化到 localStorage |

## 技术选型（规划）

推荐使用 **Zustand**，按 slice 拆分：

```ts
// store/sessionStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Session {
  userId: number | null
  token: string | null
  setSession: (userId: number, token: string) => void
  clearSession: () => void
}

export const useSessionStore = create<Session>()(
  persist(
    (set) => ({
      userId: null,
      token: null,
      setSession: (userId, token) => set({ userId, token }),
      clearSession: () => set({ userId: null, token: null }),
    }),
    { name: 'session' },
  ),
)
```

## 当前状态

目录已创建，状态待实现。现有文件：
- `role.md`（目录职责说明）
