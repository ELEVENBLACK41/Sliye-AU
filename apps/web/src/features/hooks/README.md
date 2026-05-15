# src/features/hooks/

**跨特性业务 Hooks**——被多个特性共用、携带业务含义的自定义 React Hooks（区别于纯通用的 `src/hooks/`）。

## 与 `src/hooks/` 的区别

| 维度 | `src/hooks/` | `src/features/hooks/` |
|---|---|---|
| 业务属性 | **无**，通用工具 | **有**，与业务概念耦合 |
| 数据来源 | 无外部依赖或只依赖 DOM | 可依赖 store、service |
| 示例 | `useDebounce`、`useLocalStorage` | `useCurrentUser`（读用户 store）、`usePermission` |

## 待实现 Hooks（规划）

| Hook | 说明 |
|---|---|
| `useCurrentUser` | 返回当前登录用户信息，内部读取用户 session store |
| `usePermission` | 接受权限码，返回当前用户是否有该权限 |
| `useNotification` | 返回消息通知列表和已读/未读操作方法 |
| `useAuditLog` | 封装审计日志查询逻辑 |

## 当前状态

目录已创建，Hooks 待实现。现有文件：
- `role.md`（目录职责说明）
