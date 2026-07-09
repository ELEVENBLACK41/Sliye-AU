# Server — NestJS 后端服务

## 目录

- [项目简介](#项目简介)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速启动](#快速启动)
- [环境变量](#环境变量)
- [接口列表](#接口列表)
- [统一响应格式](#统一响应格式)
- [规范评审](#规范评审)

---

## 项目简介

基于 **NestJS 11 + Prisma 7 + PostgreSQL** 搭建的 REST API 后端服务，作为 NextNest 全栈脚手架的服务端部分，运行于 `3001` 端口，供 Next.js BFF 层代理调用。

---

## 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | NestJS 11 |
| 语言 | TypeScript 5 |
| ORM | Prisma 7（Driver Adapter 模式） |
| 数据库 | PostgreSQL |
| 数据库连接 | `@prisma/adapter-pg` + `pg` |
| 配置管理 | `@nestjs/config` + 启动期环境变量校验 |
| 入参校验 | `class-validator` + `class-transformer` |
| HTTP 平台 | Express（默认） |
| 构建 | `@nestjs/cli` |
| 代码规范 | ESLint + Prettier |

---

## 目录结构

```
server/
├── prisma/                     # Prisma 数据库相关
│   ├── schema.prisma           # 数据模型定义
│   ├── prisma.config.ts        # Prisma 7 数据源配置（替代 schema url）
│   └── migrations/             # 数据库迁移历史
│
├── src/
│   ├── main.ts                 # 应用入口：注册全局 Prefix / Pipe / Filter / Interceptor
│   ├── app.module.ts           # 根模块：汇总所有功能模块
│   │
│   ├── database/               # 数据库基础设施层
│   │   ├── prisma.module.ts    # 全局 Prisma 模块（@Global）
│   │   └── prisma.service.ts   # PrismaService：管理连接生命周期
│   │
│   ├── common/                 # 跨模块公共基础设施
│   │   ├── interceptors/       # 拦截器（统一响应格式）
│   │   ├── filters/            # 异常过滤器（统一异常格式）
│   │   ├── guards/             # 守卫（鉴权 / 权限）[待扩展]
│   │   ├── pipes/              # 管道（入参校验 / 转换，当前全局管道在 main.ts 注册）
│   │   ├── decorators/         # 自定义装饰器 [待扩展]
│   │   └── utils/              # 工具函数 [待扩展]
│   │
│   ├── config/                 # 配置层（env 解析、启动期校验、默认值收敛）
│   │
│   ├── modules/                # 业务功能模块
│   │   ├── health/             # 健康检查模块
│   │   ├── auth/               # 认证模块
│   │   └── test/               # 历史测试模块（未注册到 AppModule）
│   │
│   ├── types/                  # 全局共享类型定义 [待扩展]
│   └── generated/              # Prisma 自动生成的客户端（勿手动编辑）
│
└── test/                       # E2E 测试
```

---

## 快速启动

### 前置条件

- Node.js ≥ 22
- pnpm ≥ 9
- PostgreSQL 数据库（本地或远程）

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

```bash
# 编辑 .env，设置 DATABASE_URL
DATABASE_URL="postgresql://user:pass@localhost:5432/dbname?schema=public"
SERVER_API_PREFIX="api/v1"
```

### 数据库迁移

```bash
pnpm prisma migrate dev
```

### 启动开发服务

```bash
pnpm dev
# 等同于: nest start --watch
# 监听端口: 3001
```

### 构建生产包

```bash
pnpm build
node dist/src/main.js
```

---

## 环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://user:pass@localhost:5432/dbname?schema=public` |
| `NODE_ENV` | 运行环境，可选 `development` / `production` / `test` | `development` |
| `PORT` | 服务监听端口（可选，默认 3001） | `3001` |
| `SERVER_API_PREFIX` | 全局 API 前缀（可选，默认 `api/v1`） | `api/v1` |
| `AUTH_ACCESS_TOKEN_SECRET` | access token 签名密钥，生产环境必填且不少于 32 位 | `replace-with-at-least-32-random-characters` |
| `AUTH_ACCESS_TOKEN_TTL_SECONDS` | access token 有效期秒数 | `900` |
| `AUTH_REFRESH_TOKEN_TTL_SECONDS` | refresh token 有效期秒数 | `2592000` |
| `AUTH_EMAIL_CODE_SECRET` | 邮箱验证码哈希密钥，生产环境必填且不少于 32 位 | `replace-with-at-least-32-random-characters` |
| `AUTH_EMAIL_CODE_TTL_SECONDS` | 邮箱验证码有效期秒数 | `600` |
| `AUTH_EMAIL_CODE_COOLDOWN_SECONDS` | 邮箱验证码重发冷却秒数 | `60` |
| `AUTH_EMAIL_CODE_MAX_ATTEMPTS` | 单个验证码最大尝试次数 | `5` |

---

## 接口列表

> 默认全局前缀为 `/api/v1`，所有响应均包装为统一格式，见下节。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 服务存活检查 |
| GET | `/api/v1/health/ready` | 服务就绪检查，校验数据库连接 |
| GET | `/api/v1/auth/password-public-key` | 获取密码传输加密公钥 |
| POST | `/api/v1/auth/register` | 注册并生成邮箱验证码 |
| POST | `/api/v1/auth/email-verification/send` | 重新发送邮箱验证码 |
| POST | `/api/v1/auth/email-verification/confirm` | 确认邮箱验证码并登录 |
| POST | `/api/v1/auth/login` | 登录 |
| POST | `/api/v1/auth/refresh` | 刷新 access token |
| GET | `/api/v1/auth/me` | 获取当前登录用户 |
| POST | `/api/v1/auth/logout` | 注销当前会话 |
| GET | `/api/v1/access-management/users` | 查询用户、角色和用户级授权 |
| GET | `/api/v1/access-management/roles` | 查询角色列表 |
| POST | `/api/v1/access-management/roles` | 创建角色 |
| PATCH | `/api/v1/access-management/roles/:roleId` | 更新角色 |
| GET | `/api/v1/access-management/permissions` | 查询权限列表 |
| POST | `/api/v1/access-management/permissions` | 创建权限 |
| POST | `/api/v1/access-management/users/:userId/roles` | 给用户绑定角色 |
| DELETE | `/api/v1/access-management/users/:userId/roles/:roleId` | 解除用户角色 |
| POST | `/api/v1/access-management/roles/:roleId/permissions` | 给角色绑定权限 |
| DELETE | `/api/v1/access-management/roles/:roleId/permissions/:permissionId` | 解除角色权限 |
| POST | `/api/v1/access-management/users/:userId/permissions` | 给用户添加直接授权或拒绝 |
| DELETE | `/api/v1/access-management/users/:userId/permissions/:userPermissionId` | 删除用户级直接授权或拒绝 |

---

## 统一响应格式

### 成功

```json
{
  "code": 0,
  "message": "success",
  "data": { "..." : "..." },
  "timestamp": 1778041000929
}
```

### 失败

```json
{
  "code": 404,
  "message": "Cannot GET /xxx",
  "data": null,
  "timestamp": 1778041000929
}
```

> - `code: 200` 代表业务成功
> - `code` 为 HTTP 状态码代表异常
> - `timestamp` 为服务端响应时刻的 Unix 毫秒时间戳

---

## 规范评审

> 以下是对当前代码库与大厂 NestJS 最佳实践的对比评审。

### ✅ 已达标

| 规范项 | 说明 |
|--------|------|
| 模块化分层架构 | 按 `database / common / modules / config` 四层划分，职责清晰 |
| 全局统一响应格式 | `TransformInterceptor` 封装所有成功响应 |
| 全局统一异常处理 | `AllExceptionsFilter` 捕获全量异常，避免裸露堆栈 |
| 全局 API 前缀 | 默认 `/api/v1`，通过 `SERVER_API_PREFIX` 配置 |
| 全局 DTO 校验 | `ValidationPipe` 开启 `whitelist`、`forbidNonWhitelisted`、`transform` |
| 健康检查 | 提供 `health` / `health/ready` 两类接口 |
| 数据库连接生命周期管理 | `PrismaService` 实现 `OnModuleInit / OnModuleDestroy`，支持优雅关闭 |
| 全局 PrismaModule | `@Global()` 装饰，避免在每个业务模块重复导入 |
| 配置全局化 | `ConfigModule.forRoot({ isGlobal: true })` |
| Prisma 7 适配 | 使用 `@prisma/adapter-pg` Driver Adapter 模式 |
| 文件头注释 | 每个文件均有作者、日期、描述等标准注释头 |
| 跨域支持 | `app.enableCors()` 已开启 |
| Logger 使用 | 使用 NestJS 内置 `Logger` 而非 `console.log` |
| Controller / Service 分离 | 控制器只做路由映射，业务逻辑下沉到 Service |
| 构建产物资源复制 | `nest-cli.json` 配置 assets 将 `generated/` 正确复制到 `dist/` |

### ⚠️ 待改进（成长路线）

| 规范项 | 当前状态 | 建议 |
|--------|----------|------|
| Swagger 文档 | 已集成 `/api-docs` | 后续补充更多 `@ApiResponse` 示例 |
| 认证鉴权 | 已有自研 access token guard | 后续可扩展权限 guard 和策略装饰器 |
| TypeScript strict 模式 | `noImplicitAny: false` | 逐步开启，消除隐式 `any` |
| Seed 数据与业务代码混合 | 历史 `TestModule` 仍保留源码但未注册 | 后续删除或迁移为独立 seed 脚本 |
| 环境变量类型安全 | 已通过 `validateEnvConfig` 启动期校验 | 后续按模块拆分更多类型化配置 |
| `start:prod` 路径错误 | 已改为 `dist/src/main` | 后续可补 Dockerfile / 部署说明 |
| 测试覆盖 | 已有配置校验单测，业务测试仍少 | 补充 auth service、guard 和后续 decisions 模块测试 |
