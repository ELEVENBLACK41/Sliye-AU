# Sliye-AU

Next.js + NestJS + Prisma 全栈 Monorepo 项目。

---

## 项目结构

```
apps/
  server/   # NestJS 后端
  web/      # Next.js 前端
  admin/    # Next.js 管理端
packages/
  ui/       # 共享组件库
```

---

## 环境变量配置（新成员必读）

项目使用环境变量管理数据库连接、端口、API 地址等配置。每个应用需要单独创建各自的 `.env` 文件，**这些文件不会提交到 git**，需要手动创建。

### 1. 后端（apps/server）

在 `apps/server/` 目录下创建 `.env` 文件：

```bash
# apps/server/.env
DATABASE_URL=postgresql://用户名:密码@localhost:5432/数据库名
PORT=3001
SERVER_API_PREFIX=api/v1
```

**示例（本地开发）：**

```bash
DATABASE_URL=postgresql://postgres:123456@localhost:5432/Sliye
PORT=3001
SERVER_API_PREFIX=api/v1
```

> 参考模板：[apps/server/.env.example](apps/server/.env.example)

**变量说明：**

| 变量名 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接字符串，Prisma 和 NestJS 都会读取 | 必填 |
| `PORT` | NestJS 监听端口 | `3001` |
| `SERVER_API_PREFIX` | NestJS 全局 API 前缀 | `api/v1` |

### 2. 前端（apps/web）

在 `apps/web/` 目录下创建 `.env.local` 文件：

```bash
# apps/web/.env.local
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEST_BASE_URL=http://localhost:3001
NEST_API_PREFIX=api/v1
```

**变量说明：**

| 变量名 | 说明 |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | 前端页面发起请求的 base URL，指向 Next.js 自身（走 BFF 代理层） |
| `NEST_BASE_URL` | 服务端（BFF）代理请求时使用的 NestJS 服务地址，仅服务端可读 |
| `NEST_API_PREFIX` | BFF 请求 NestJS 时自动拼接的 API 前缀，默认 `api/v1` |

> `NEXT_PUBLIC_` 前缀的变量会暴露到浏览器，`NEST_BASE_URL` 不加前缀所以只在服务端可见，更安全。

---

## 请求链路说明

```
浏览器 / SSR
  → http://localhost:3000/api/*              (Next.js BFF 路由)
  → http://localhost:3001/api/v1/*           (NestJS 接口)
  → PostgreSQL 数据库
```

---

## 启动步骤

```bash
# 1. 安装依赖（根目录执行）
pnpm i

# 2. 配置环境变量（按上文创建 .env 文件）

# 3. 执行数据库迁移（apps/server 目录下）
pnpm prisma migrate dev

# 4. 启动后端（apps/server 目录下）
pnpm dev

# 5. 启动前端（apps/web 目录下）
pnpm dev
```

---

## 常见问题

**Q: 页面报错 `Failed to parse URL from undefined/api/...`**  
A: `apps/web/.env.local` 未创建或 `NEXT_PUBLIC_BASE_URL` 未设置，按上文步骤创建后重启 web dev server。

**Q: 数据库连接失败**  
A: 检查 `apps/server/.env` 中 `DATABASE_URL` 的用户名、密码、数据库名是否正确，确认 PostgreSQL 服务正在运行。

**Q: 修改 `.env` 后不生效**  
A: Next.js 和 NestJS 都需要重启 dev server 才能读取新的环境变量。
