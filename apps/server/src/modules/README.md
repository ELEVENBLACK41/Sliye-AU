# src/modules/ — 业务功能模块

本目录按**领域（Domain）**划分业务功能，每个子目录是一个独立的 NestJS 模块，遵循"高内聚、低耦合"原则。

---

## 模块规范

每个业务模块的标准结构如下：

```
module-name/
├── module-name.module.ts      # 模块定义：注册 Controller 和 Provider
├── module-name.controller.ts  # 路由层：处理 HTTP 请求，调用 Service
├── module-name.service.ts     # 业务层：核心业务逻辑，调用 Repository / PrismaService
├── dto/                       # 数据传输对象：入参校验（待完善）
│   ├── create-xxx.dto.ts
│   └── update-xxx.dto.ts
└── entities/                  # 实体类型定义（可选，Prisma 已生成类型时可省略）
```

**各层职责**：

| 层级 | 文件 | 职责 |
|------|------|------|
| 路由层 | `*.controller.ts` | 定义路由、处理请求参数、调用 Service、返回响应 |
| 业务层 | `*.service.ts` | 业务规则、数据组合、调用数据库 |
| 模块定义 | `*.module.ts` | 声明模块依赖，注册 Controller 和 Provider |

---

## 当前模块

### `test/` — 开发测试模块

**用途**：开发阶段的接口调通测试，验证数据库连接等基础设施是否正常。

| 文件 | 说明 |
|------|------|
| `test.module.ts` | 注册 `TestController` 和 `TestService` |
| `test.controller.ts` | 路由：`GET /test`、`GET /test/test1`、`GET /test/users` |
| `test.service.ts` | 业务：心跳回包、查询用户列表（含自动 seed） |

**路由详情**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/test` | 返回固定字符串，验证服务是否运行 |
| GET | `/test/test1` | 同上，第二个心跳测试 |
| GET | `/test/users` | 查询全部用户及其文章；若表为空，先写入 3 条 seed 数据 |

> ⚠️ 当前 `getUsers()` 内含 seed 逻辑（检测到表为空时自动写入数据），这是为了开发便利。  
> 生产环境应将 seed 逻辑独立为 `prisma/seed.ts`，通过 `prisma db seed` 命令执行。

---

## 规划中的模块

### `user/` — 用户模块（待实现）

管理系统用户的 CRUD，预期接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/users` | 获取用户列表（分页） |
| GET | `/users/:id` | 获取单个用户详情 |
| POST | `/users` | 创建用户 |
| PATCH | `/users/:id` | 更新用户信息 |
| DELETE | `/users/:id` | 删除用户 |

---

### `auth/` — 认证模块（待实现）

基于 JWT 的用户认证，预期接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/auth/login` | 用户登录，返回 JWT |
| POST | `/auth/register` | 用户注册 |
| GET | `/auth/profile` | 获取当前登录用户信息（需 JWT） |
| POST | `/auth/refresh` | 刷新 Token |

**推荐技术栈**：`@nestjs/passport` + `passport-jwt` + `passport-local`

---

### `audit/` — 审计日志模块（待实现）

记录关键操作的操作日志，预期功能：

- 通过拦截器自动记录增删改操作
- 查询操作日志列表（管理员接口）
- 支持按用户、时间、操作类型过滤

---

## 新增模块的步骤

```bash
# 使用 NestJS CLI 一键生成模块骨架
nest generate module modules/feature-name
nest generate controller modules/feature-name
nest generate service modules/feature-name
```

生成后在 `app.module.ts` 的 `imports` 中注册新模块即可。
