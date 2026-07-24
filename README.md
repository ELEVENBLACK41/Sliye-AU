# Sliye-AU

Next.js + NestJS + Prisma 全栈 Monorepo 项目。

---

## 项目结构

```
apps/
  server/   # NestJS 后端
  web/      # Next.js 前端
  admin/    # 已冻结；管理能力统一在 web 中实现
packages/
  ui/       # 共享组件库
  contracts/# 前后端权限、认证、响应与决策契约
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
AVATAR_UPLOAD_DIR=./uploads/avatars
```

**示例（本地开发）：**

```bash
DATABASE_URL=postgresql://postgres:123456@localhost:5432/Sliye
PORT=3001
SERVER_API_PREFIX=api/v1
AVATAR_UPLOAD_DIR=./uploads/avatars
```

> 参考模板：[apps/server/.env.example](apps/server/.env.example)

**变量说明：**

| 变量名              | 说明                                                         | 默认值              |
| ------------------- | ------------------------------------------------------------ | ------------------- |
| `DATABASE_URL`      | PostgreSQL 连接字符串，Prisma 和 NestJS 都会读取             | 必填                |
| `PORT`              | NestJS 监听端口                                              | `3001`              |
| `SERVER_API_PREFIX` | NestJS 全局 API 前缀                                         | `api/v1`            |
| `AVATAR_UPLOAD_DIR` | 用户头像本地存储目录；生产环境需使用具备持久化能力的挂载目录 | `./uploads/avatars` |

### 2. 前端（apps/web）

在 `apps/web/` 目录下创建 `.env.local` 文件：

```bash
# apps/web/.env.local
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEST_BASE_URL=http://localhost:3001
NEST_API_PREFIX=api/v1
```

**变量说明：**

| 变量名                 | 说明                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_BASE_URL` | 前端页面发起请求的 base URL，指向 Next.js 自身（走 BFF 代理层） |
| `NEST_BASE_URL`        | 服务端（BFF）代理请求时使用的 NestJS 服务地址，仅服务端可读     |
| `NEST_API_PREFIX`      | BFF 请求 NestJS 时自动拼接的 API 前缀，默认 `api/v1`            |

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

# 3. 执行数据库迁移和权限目录同步（apps/server 目录下）
pnpm prisma migrate deploy
pnpm prisma generate
pnpm access-control:sync

# 4. 启动后端（apps/server 目录下）
pnpm dev

# 5. 启动前端（apps/web 目录下）
pnpm dev
```

---

## 换电脑或拉取最新代码后的同步

在另一台电脑拉取代码后，先配置 `apps/server/.env` 和 `apps/web/.env.local`。环境变量不会被 Git 同步；尤其要确认 `DATABASE_URL` 指向预期的 PostgreSQL 数据库。

```bash
# 项目根目录：安装与锁文件一致的依赖
pnpm install --frozen-lockfile

# apps/server 目录：依次同步数据库结构、生成 Prisma Client、同步并检查系统权限目录
pnpm prisma migrate deploy #应用 Git 拉下来的已有数据库迁移
pnpm prisma generate #根据当前 Prisma Schema 生成本机的 Prisma Client
pnpm access-control:sync #将权限目录、系统角色和默认授权同步进数据库
pnpm access-control:check #只检查数据库与权限代码是否一致，不写数据
```

Windows PowerShell 若提示禁止运行 `pnpm.ps1`，将上述命令中的 `pnpm` 替换为 `pnpm.cmd`。

- `prisma migrate deploy` 只应用仓库已有迁移；拉取代码后不要使用 `prisma migrate dev` 或 `prisma db push`。
- `access-control:sync` 会把代码中的系统权限、系统角色和默认授权同步到数据库；`access-control:check` 只读检查两者是否一致。
- 若两台电脑连接同一个数据库，只会同步结构和权限配置，业务数据会保持一致；若连接不同数据库，则需要另行导入数据库备份或重新初始化业务数据。

权限同步时还要确保存在一个有效用户可成为超级管理员；脚本无法自动判断时，需要在 apps/server/.env 配置：

BOOTSTRAP_SUPER_ADMIN_EMAIL=你的已注册邮箱
前提是这个邮箱对应的用户已经存在且状态为 ACTIVE。

---

## 权限体系 V2

当前项目已实现单组织部门树、四个系统角色、代码优先权限目录、角色/用户授权、数据范围、授权审计和统一错误响应。应用启动时只读检查权限目录漂移，不会自动写数据库；部署时应显式执行：

```bash
pnpm --filter @nextnest/server access-control:sync
pnpm --filter @nextnest/server access-control:check
```

详细模型、角色矩阵、迁移与测试结果见 [项目权限模型](docs/项目权限模型.md)。

---

## 常见问题

**Q: 页面报错 `Failed to parse URL from undefined/api/...`**  
A: `apps/web/.env.local` 未创建或 `NEXT_PUBLIC_BASE_URL` 未设置，按上文步骤创建后重启 web dev server。

**Q: 数据库连接失败**  
A: 检查 `apps/server/.env` 中 `DATABASE_URL` 的用户名、密码、数据库名是否正确，确认 PostgreSQL 服务正在运行。

**Q: 修改 `.env` 后不生效**  
A: Next.js 和 NestJS 都需要重启 dev server 才能读取新的环境变量。
