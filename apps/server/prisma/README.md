# prisma/ — 数据库定义与迁移

本目录包含 Prisma ORM 的所有数据库相关配置，是整个数据库的"事实来源"（Source of Truth）。

---

## 文件说明

### `schema.prisma`

**Prisma 数据模型定义文件**，定义了数据库表结构、字段类型、关联关系。

```
generator client {
  provider     = "prisma-client-js"
  output       = "../src/generated/prisma"   ← 生成客户端的输出路径
  moduleFormat = "cjs"                        ← 强制 CommonJS 格式，兼容 NestJS 编译
}

datasource db {
  provider = "postgresql"                     ← 数据库类型
  // Prisma 7 不在此处配置 url，改为通过 adapter 传入
}
```

当前数据模型：

| 模型 | 表名 | 说明 |
|------|------|------|
| `User` | `User` | 用户信息，含唯一邮箱、姓名 |
| `Post` | `Post` | 文章，与 `User` 为多对一关联 |

> **注意**：Prisma 7 已废弃在 `datasource` 中写 `url` 字段，连接串改由 `prisma.config.ts` + driver adapter 传递。

---

### `prisma.config.ts`

**Prisma 7 专属配置文件**（位于 server 根目录），替代旧版 schema 中的 `datasource url`。

```ts
datasource: {
  url: process.env['DATABASE_URL'],   ← 仅供 Prisma CLI 工具（migrate / generate）使用
}
```

> 运行时连接串由 `PrismaService` 通过 `@prisma/adapter-pg` 传入，两者互不干扰。

---

### `migrations/`

**数据库迁移历史目录**，由 `prisma migrate dev` 自动生成和维护，**禁止手动修改**。

| 路径 | 说明 |
|------|------|
| `migration_lock.toml` | 记录当前使用的数据库驱动，防止误切换 |
| `20260428085347_init/migration.sql` | 初始建表 SQL，创建 `User`、`Post` 表及索引 |

---

## 常用命令

```bash
# 开发阶段：生成迁移 + 应用 + 重新生成客户端（三合一）
pnpm prisma migrate dev --name 你的迁移名称

# 仅重新生成客户端（schema 或 adapter 变更后执行）
pnpm prisma generate

# 在生产环境应用已有迁移（不生成新迁移）
pnpm prisma migrate deploy

# 打开数据库可视化管理界面
pnpm prisma studio
```

---

## 注意事项

- `generated/` 目录由 `prisma generate` 自动生成，已加入 `.gitignore`，**不要手动修改**。
- 每次修改 `schema.prisma` 后都必须执行 `prisma migrate dev`（开发）或 `prisma migrate deploy`（生产），并重新运行 `prisma generate`。
