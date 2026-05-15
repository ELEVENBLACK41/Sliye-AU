# src/features/store/

**跨特性共享业务状态**——多个特性模块都需要读写的全局业务状态（区别于各特性自己的局部状态，以及纯技术性的 `src/store/`）。

## 与 `src/store/` 的区别

| 维度 | `src/store/` | `src/features/store/` |
|---|---|---|
| 业务属性 | **无** 或极少（如主题、语言偏好） | **有**，直接操作业务数据 |
| 典型内容 | theme slice、i18n slice | 购物车 slice、通知中心 slice、待办任务 slice |

## 规划内容

| Store | 说明 |
|---|---|
| `notificationStore` | 实时通知消息列表，WebSocket 推送后写入，Topbar 铃铛组件读取 |
| `auditQueueStore` | 待审批任务队列（审批流状态） |
| `permissionStore` | 当前用户的权限码集合，登录后写入，PermissionGate 组件读取 |

## 技术选型（规划）

推荐使用 **Zustand**（轻量、无样板代码、支持分片）：
```bash
pnpm add zustand
```

```ts
// 示例：notificationStore.ts
import { create } from 'zustand'

interface NotificationStore {
  list: Notification[]
  unreadCount: number
  markAllRead: () => void
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  list: [],
  unreadCount: 0,
  markAllRead: () => set((s) => ({ ...s, list: s.list.map(n => ({ ...n, read: true })), unreadCount: 0 })),
}))
```

## 当前状态

目录已创建，状态待实现。现有文件：
- `role.md`（目录职责说明）
