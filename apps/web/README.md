# Web：Next.js BFF 与权限界面

`apps/web` 使用 Next.js 16 App Router、React 19 和 Tailwind CSS 4。冻结的 `apps/admin` 未参与本轮改造；用户、部门、角色和授权能力全部作为 Web 业务模块实现。

## 请求与认证链路

```mermaid
flowchart LR
  A[Browser] --> B[Next.js 页面 / Route Handler]
  B --> C[/api/* BFF]
  C --> D[NestJS /api/v1/*]
  D --> E[Prisma / PostgreSQL]
```

- 浏览器只请求同源 `/api/*`，Nest 内部地址和 token 不暴露给浏览器 JavaScript。
- access token 与 refresh token 仅存于 `httpOnly` Cookie。
- 浏览器请求工具和受保护 BFF 代理都实现 refresh single-flight，同一刷新令牌的并发 401 只执行一次轮换。
- Server Component 通过 `/auth/profile` 获取最新用户、部门、角色、权限码和 `accessState`；权限不跨请求缓存。
- `ApiClientError` 保留 `status`、`code`、`details`、`requestId`，页面不会把结构化错误退化成普通字符串错误。

## 页面权限

| 路由                        | 行为                                                     |
| --------------------------- | -------------------------------------------------------- |
| `/login`                    | 登录、公开注册和邮箱验证；已修复横向溢出并通过浏览器检查 |
| `/dashboard/pending-access` | 新用户尚无部门或角色时展示待授权说明                     |
| `/dashboard/forbidden`      | 中文 403 页面                                            |
| `/dashboard/users`          | 部门树、用户调动/状态、角色、范围授权、直接授权和审计    |
| `/dashboard/profile`        | 本人头像上传、移除、显示名称修改和只读账号信息           |
| `/dashboard/decisions`      | 真实决策列表、空状态和创建入口                           |
| `/dashboard/decisions/:id`  | 真实决策详情与参与者；后端防 IDOR                        |
| `/dashboard/ai`             | 需要 `ai:chat:use` 的流式 AI 对话                        |

Dashboard 导航只展示拥有对应系统权限码的模块。页面入口在 Server Component 再校验一次；按钮按更细的 create/update/assign 权限分别展示。真实安全边界仍是 NestJS 后端。

## 权限管理工作区

`src/features/access-management` 提供：

- 当前数据范围内的用户列表与部门树；
- 部门创建、改名、移动和启停；
- 用户主部门调动和账号状态修改；
- 自定义角色创建、修改、删除；
- 用户角色绑定与解绑；
- 角色权限按 `grantId + scopeType` 维护；
- 用户直接 `ALLOW`、全局 `DENY/ALL`、可选过期时间；
- 访问控制审计列表；
- loading、empty、error、success 和只读状态。

系统角色和系统权限在页面中只读，后端也会再次拒绝修改。

## 决策与 AI

决策列表和详情由 Server Component 读取，返回数据已经在 NestJS 通过 Prisma `where` 按授权范围裁剪。创建成功时，创建人会自动成为 `OWNER` 参与者，因此拥有 `PARTICIPATED` 读取范围的成员仍能看到自己创建的决策。

`/api/chat` 在创建 AI 流之前读取最新认证资料并校验 `ai:chat:use`。成功响应保持 AI SDK 流协议；401、403、400 和 500 使用统一 JSON 错误契约。

## 目录

```text
apps/web/src/
├── app/
│   ├── (dashboard)/dashboard/   # 页面、loading/error、待授权和 403
│   └── api/                     # Auth、权限管理、决策、AI BFF
├── features/
│   ├── auth/                    # 认证资料、Cookie 刷新、页面权限工具
│   ├── profile/                 # 个人资料表单与头像管理
│   ├── access-management/       # 权限与组织管理
│   ├── decisions/               # 决策列表/详情/创建
│   ├── ai/                      # AI 对话客户端
│   └── navigation/              # 权限菜单
└── services/
    ├── request.ts               # 浏览器 ApiClientError + refresh single-flight
    └── bff-request.ts           # BFF 到 NestJS 的统一响应保留
```

## 环境与命令

```bash
# apps/web/.env.local
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEST_BASE_URL=http://localhost:3001
NEST_API_PREFIX=api/v1
AI_GATEWAY_API_KEY=本地或CI使用的Gateway密钥
AI_MODEL_STANDARD_ID=openai/gpt-5.4-nano
AI_RUNTIME_SERVICE_SECRET=与NestJS一致的高熵内部服务密钥
```

Vercel 部署可以使用自动提供的 OIDC 调用 AI Gateway，不需要同时配置静态密钥。模型环境变量只能选择
`src/features/ai/runtime/ai-model-registry.ts` 已登记且类型匹配的模型；修改后需要重启 Web 服务。
当前 `standard` 默认使用低成本 Nano，Mini 只在 Gateway 主模型不可用时回退；`deepReview`、
`embedding` 和 `reranker` 在对应产品阶段开放前只登记能力，不会自行产生调用费用。
`AI_RUNTIME_SERVICE_SECRET` 仅供 Web BFF 服务端调用 NestJS 内部执行接口，不能使用
`NEXT_PUBLIC_` 前缀；修改后需要同时重启 Web 与 NestJS 服务。

```bash
pnpm dev
pnpm lint
pnpm exec tsc --noEmit
pnpm build
pnpm test:ai:model
pnpm test:ai:gateway:smoke
```

`test:ai:model` 只使用 AI SDK Mock，不产生真实费用。`test:ai:gateway:smoke` 使用固定短提示；缺少
`AI_GATEWAY_API_KEY` 和 `VERCEL_OIDC_TOKEN` 时会明确输出 `SKIP`，不能把跳过视为真实 Gateway 已验收。

生产构建需要 `next/font` 获取已配置的 Geist 字体；离线环境应提供可访问的字体构建缓存或改为项目内本地字体。
