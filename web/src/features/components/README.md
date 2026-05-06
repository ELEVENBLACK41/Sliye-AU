# src/features/components/

**跨特性业务组件**——被多个特性共用、但携带业务属性的组件（区别于纯 UI 的 `src/components/`）。

## 与 `src/components/` 的区别

| 维度 | `src/components/` | `src/features/components/` |
|---|---|---|
| 业务属性 | **无**，纯 UI | **有**，与业务概念耦合 |
| 数据来源 | 只接受 props | 可连接 store、调用 service |
| 复用范围 | 全局，无限制 | 多个业务特性共用 |
| 典型示例 | Button、Input、Modal | UserAvatar（读取用户 store）、PermissionGate（读取权限 store）|

## 待实现组件（规划）

| 组件 | 说明 |
|---|---|
| `UserAvatar` | 显示当前登录用户头像，内部读取用户会话 store |
| `PermissionGate` | 权限门控组件，根据用户权限决定是否渲染子组件 |
| `AuditBadge` | 审计状态标识，展示数据的最后修改人/时间 |

## 当前状态

目录已创建，组件待实现，项目功能成熟后按需添加。现有文件：
- `role.md`（目录职责说明）
