# 项目架构图

这里保存项目的可编辑 draw.io 图表，内容基于当前仓库结构、Next.js BFF 请求链路、NestJS 模块和 `apps/server/prisma/schema.prisma` 数据模型生成。

## 文件

- [系统架构图](architecture/system_architecture.drawio)
  - 展示 `apps/web`、`apps/admin`、`apps/server`、`packages/ui`、Prisma 和 PostgreSQL 的整体关系。
  - 标出浏览器到 Next.js Route Handler，再到 NestJS API、Prisma、数据库的主请求链路。
  - 标出认证链路里的 httpOnly Cookie、全局响应拦截器、异常过滤器和后续 Outbox 演进点。

- [数据库 ERD](database/database_erd.drawio)
  - 展示认证、RBAC、权限申请、组织、Decision Replay 主链路、会议、事件和辅助表。
  - 表字段只保留主键、外键、唯一约束和核心业务字段；完整字段以 `apps/server/prisma/schema.prisma` 为准。
  - 实线表示 Prisma schema 中显式关系；虚线表示自引用或逻辑关联。

## 模块拆分图

下面这些图更适合日常查看和讲解，每张只保留一个模块的关系，避免总图线太密。

- [请求链路与应用分层](modules/request_flow.drawio)
  - 浏览器、Next.js BFF、NestJS、Prisma、PostgreSQL 的调用链。

- [认证与会话模块](modules/auth_module.drawio)
  - 用户、密码凭据、第三方账号、会话、refresh token、邮箱验证、密码重置和认证审计。

- [RBAC 与权限申请模块](modules/rbac_module.drawio)
  - 角色、权限、用户角色、角色权限、用户级授权、权限申请单和申请明细。

- [Decision Replay 主链路模块](modules/decision_module.drawio)
  - 决策、参与者、提案、投票、任务、会议、会议参与者和事件时间线。

- [组织与辅助表模块](modules/support_module.drawio)
  - 部门树、用户归属、Post demo 表、ResourceParticipant 和 OutboxEvent。

## 打开方式

可以用 diagrams.net / draw.io Desktop / VS Code Draw.io Integration 打开 `.drawio` 文件继续编辑。
