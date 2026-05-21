# NextNest 项目级开发规范

这个文档给自己长期维护项目时使用，也可以作为后续让 AI 助手参与开发前的项目上下文。

## 项目定位

NextNest 是个人全栈练习和作品集项目，核心目标是沉淀 `React + Next.js + NestJS + Prisma + PostgreSQL` 的工程经验，并逐步做出能展示产品设计、前端交互、动画能力和后端工程能力的完整功能。

开发时优先考虑：

- 能不能作为跳槽作品展示。
- 功能链路是不是完整，而不是只停留在 demo。
- 代码结构是不是清楚，半年后自己还能快速接手。
- 不把公司项目代码、业务数据、接口地址、账号密钥复制进个人项目。

## 产品方向

当前建议继续沿着“以决策为核心的跨端协作系统”推进。这个方向比普通任务管理系统更有辨识度，也更容易在面试里讲出后端建模、权限、审计、实时协作、事件回放这些技术深度。

一句话定位：

> 让团队的每一个关键决策，都可追踪、可回放、可复盘。

项目可以暂定命名方向为 `DecisionOps`、`Decision Hub` 或 `决策中枢`。后续正式开源前再确定最终名称。

这个项目不是泛任务管理、不是飞书/Notion/ Jira 的大而全复制，而是围绕 `Decision` 做一条闭环：

```txt
提出问题 -> 补充背景 -> 邀请参与者 -> 讨论/任务推进 -> 形成结论 -> 绑定会议/材料 -> 事件时间线 -> 回放与复盘
```

### 三端定位

| 端 | 定位 | 先做什么 |
| --- | --- | --- |
| `web` | 团队成员日常协作端 | 决策列表、决策详情、评论、任务、时间线、回放 |
| `admin` | 管理和配置端 | 用户、部门、角色、权限矩阵、审计日志、系统配置 |
| `app` | 移动端，后续新增 | 通知、审批、快速评论、会议记录查看 |
| `ios` | 更后续的原生端可能性 | 只有当 app/web 业务稳定后再考虑 |

移动端不要太早开工。MVP 阶段先把 `web + admin + server` 跑通，等核心链路成型后，再考虑用 Expo / React Native 增加 `apps/app`。

## MVP 边界

为了避免项目做大烂尾，第一版只做“决策闭环”，不做完整企业协同套件。

MVP 必须跑通的演示链路：

```txt
登录用户
  -> 创建部门/用户/角色
  -> 创建决策
  -> 添加参与者
  -> 记录讨论和任务
  -> 推进决策状态
  -> 自动沉淀事件时间线
  -> 在回放页按时间查看发生了什么
  -> admin 查看权限和审计
```

第一阶段建议只做这些核心模块：

| 模块 | 目标 |
| --- | --- |
| Auth/User/Department | 能登录、能区分用户和部门 |
| RBAC + Data Scope | 能控制谁能看、谁能改、能看哪些范围 |
| Decision | 决策的创建、编辑、状态流转、负责人和参与者 |
| DecisionTask | 只做绑定决策的小任务，不做完整项目管理 |
| Comment/Discussion | 决策详情里的讨论记录 |
| DecisionEvent | 追加式事件日志，用于审计和回放 |
| Admin Permission Matrix | 管理角色和权限 |

明确先不做：

- 不自研音视频会议，先绑定外部会议链接、会议时间、纪要、附件。
- 不做完整 Jira/Trello，任务只服务于某个决策。
- 不做复杂在线文档协同编辑，实时协作先做评论、在线状态、通知和事件推送。
- 不做视频级回放，第一版回放是“事件时间线 + 状态 diff + 关键节点快照”。
- 不一开始做多租户 SaaS，先按单 workspace / 单组织设计，schema 预留扩展空间即可。
- 不太早做移动端，避免三端同时失控。

## 面试亮点设计

这个项目后续可以围绕下面这些亮点建设，优先做能讲清楚原理和权衡的部分：

| 亮点 | 可讲内容 |
| --- | --- |
| Monorepo 工程化 | pnpm workspace、apps/packages 分层、共享 UI、统一规范 |
| Next.js BFF | 浏览器只访问 Next `/api/*`，由 BFF 转发 NestJS，隔离服务端变量 |
| 模块化 NestJS | auth、users、permissions、decisions、events、audit 分模块 |
| RBAC + 数据权限 | 角色权限、用户特批、部门范围、参与者范围、临时授权 |
| 追加式事件日志 | 所有关键操作写入 `DecisionEvent`，支持审计和回放 |
| 实时协作 | WebSocket / SSE 推送评论、状态变更、在线成员和通知 |
| API 契约 | DTO 校验、OpenAPI、统一响应、前后端类型边界 |
| 数据建模 | 决策、参与者、任务、会议、事件、权限之间的关系 |
| 可观测性 | 结构化日志、请求 ID、错误追踪、关键操作审计 |
| 测试和 CI | 单元测试、E2E、lint/build/test 工作流 |

## 阶段路线

### Phase 0：工程健康

- 固定 Node.js 版本，建议升级到 Node.js 22，并在 `package.json` 增加 `engines`。
- 修复 README、注释或终端显示中的编码问题，统一 UTF-8。
- 后端增加 DTO 校验、全局 `ValidationPipe`、环境变量校验。
- 增加 OpenAPI/Swagger。
- 把测试 seed 从业务 service 中拆到 `prisma/seed.ts`。
- 修正当前 schema 里的明显问题，例如 `Department.ecisions` 拼写。

### Phase 1：决策主链路

- 建立真实 `Decision` 模块，替代当前 demo `test` 模块。
- 增加决策状态：草稿、讨论中、待确认、已决定、已归档。
- 增加参与者和负责人。
- 增加决策详情页和基础列表页。
- 每次创建、编辑、状态变化都写入事件日志。

### Phase 2：权限和审计

- 做角色、权限码、部门范围、参与者范围的有效权限计算。
- 做 admin 权限矩阵。
- 做审计日志列表和按决策过滤。
- 权限申请功能放在这一阶段后半段，不要一开始就深挖。

### Phase 3：实时协作和回放

- 增加评论实时推送、状态变化推送、在线成员。
- 做事件时间线回放页。
- 支持按时间点查看决策状态变化和关键字段 diff。

### Phase 4：会议绑定和 AI 辅助

- 决策绑定会议链接、会议时间、参会人、会议纪要。
- 后续可接 AI 摘要、风险点提取、行动项生成。
- AI 能力只作为增强项，不影响主链路完成。

## 当前技术栈

| 范围 | 技术 |
| --- | --- |
| Monorepo | pnpm workspace |
| 前台应用 | Next.js 16、React 19、Tailwind CSS 4、ESLint 9 |
| 管理端 | Next.js 16、React 19、Tailwind CSS 4、ESLint 9 |
| 后端服务 | NestJS 11、Prisma 7、PostgreSQL、Jest |
| 共享 UI | `packages/ui`、shadcn 风格、Radix UI、lucide-react、class-variance-authority |

注意：项目里的 Next.js 版本较新，改动 Next 相关能力前优先查看本地 `node_modules/next/dist/docs/`，不要只凭旧版本经验写代码。

## 目录结构

```txt
D:\NextNest
├─ apps
│  ├─ web        # 前台应用，面向用户、作品展示和主要业务体验
│  ├─ admin      # 管理端应用，面向后台管理能力
│  └─ server     # NestJS 后端服务
├─ packages
│  └─ ui         # 跨应用共享 UI 组件和工具函数
├─ package.json
├─ pnpm-workspace.yaml
└─ pnpm-lock.yaml
```

### `apps/web`

前台应用采用 Next.js App Router，源码主要放在 `apps/web/src`。

```txt
apps/web/src
├─ app           # 路由、布局、页面、Route Handler
├─ components    # 当前应用内通用组件
├─ features      # 业务模块
├─ hooks         # 当前应用内通用 hooks
├─ lib           # 当前应用内工具能力
├─ services      # 请求封装和跨模块服务
├─ store         # 全局状态
├─ styles        # 全局样式和 CSS 变量
└─ types         # 全局类型
```

### `apps/admin`

管理端当前是独立 Next.js 应用。后续后台功能优先放在这里，不要混进 `apps/web`。

### `apps/server`

后端采用 NestJS，源码主要放在 `apps/server/src`。

```txt
apps/server/src
├─ common        # 全局过滤器、拦截器、守卫、装饰器等
├─ config        # 环境变量和配置聚合
├─ database      # PrismaModule、PrismaService
├─ modules       # 业务模块
├─ types         # 后端公共类型
├─ app.module.ts
└─ main.ts
```

### `packages/ui`

共享 UI 包只放可复用、无具体业务含义的组件和工具，例如 Button、Badge、`cn`。如果组件只服务某个页面或某个业务模块，先放在对应 app 的 `components` 或 `features/<module>/components` 里。

## 常用命令

在根目录执行：

```bash
pnpm i
pnpm dev
pnpm dev:web
pnpm dev:admin
pnpm dev:server
pnpm build
pnpm lint
pnpm test
```

只操作某个 workspace：

```bash
pnpm --filter @nextnest/web dev
pnpm --filter @nextnest/admin build
pnpm --filter @nextnest/server test
pnpm --filter @workspace/ui check-types
```

Prisma 相关命令建议在 `apps/server` 下执行：

```bash
pnpm prisma migrate dev
pnpm prisma generate
pnpm prisma studio
```

## 环境变量

环境变量文件不提交到 git。新增变量时，同步更新根 README 或本文件里的说明。

后端 `apps/server/.env`：

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/database
PORT=3001
```

前台 `apps/web/.env.local`：

```bash
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEST_BASE_URL=http://localhost:3001
```

约定：

- `NEXT_PUBLIC_` 前缀变量会暴露到浏览器，只放非敏感配置。
- 后端数据库地址、密钥、token 只放服务端环境变量。
- 改完 `.env` 后重启对应 dev server。

## 请求链路

当前推荐链路：

```txt
Browser / SSR
  -> apps/web Route Handler 或 BFF
  -> apps/server NestJS API
  -> Prisma
  -> PostgreSQL
```

约定：

- 浏览器侧优先请求 Next.js 自身的 `/api/*`，由 Next BFF 转发到 NestJS。
- 不在浏览器中直接暴露后端内部地址，除非这个接口明确设计为公开接口。
- `apps/web/src/services/request.ts` 是前端请求入口，业务模块不要到处手写重复 fetch。
- feature 内的接口调用放在 `features/<module>/services`。

## API 返回格式

NestJS 已经注册全局响应拦截器和异常过滤器。

成功响应：

```ts
{
  code: 0,
  message: 'success',
  data: T,
  timestamp: number,
}
```

异常响应：

```ts
{
  code: httpStatus,
  message: string,
  data: null,
  timestamp: number,
}
```

约定：

- service 返回真实业务数据，不手动包装 `code/message/data`。
- controller 保持薄，只做路由、参数接收和调用 service。
- 业务错误使用 NestJS 标准异常，例如 `BadRequestException`、`NotFoundException`、`ForbiddenException`。
- 前端类型里要区分接口外壳类型和真实业务数据类型。

## 前端开发规范

### 路由和组件

- 页面和布局放在 `src/app`。
- 业务模块放在 `src/features/<module>`。
- 模块内部推荐结构：

```txt
features/<module>
├─ components
├─ hooks
├─ services
├─ store
├─ types
└─ index.ts
```

- 跨多个业务使用的组件放 `src/components`。
- 跨 `web/admin` 复用且不带业务语义的组件再沉淀到 `packages/ui`。

### Server Component 和 Client Component

- App Router 下默认使用 Server Component。
- 只有需要交互状态、浏览器 API、事件监听、动画控制、客户端状态管理时才加 `'use client'`。
- 数据获取优先在服务端完成，交互型数据再放到 client 侧。

### 样式和 UI

- 优先使用 Tailwind CSS 4 和已有 CSS 变量。
- UI 组件风格跟随 shadcn/new-york、Radix UI、lucide-react。
- 图标优先用 lucide-react。
- 按钮、Badge、基础控件优先复用 `@workspace/ui`。
- 做作品集页面时，首屏要直接体现作品和能力，不要只保留 create-next-app 默认内容。
- 动画要服务于体验和表达，避免为了炫技影响可读性和性能。

### 类型和导出

- `@/*` 指向 `apps/web/src/*`。
- `@workspace/ui/*` 指向共享 UI 包。
- feature 对外通过 `index.ts` 收口导出。
- 请求响应、列表项、表单值、枚举值都要有明确类型。

## 后端开发规范

### 模块组织

新增业务模块放在 `apps/server/src/modules/<module>`：

```txt
modules/<module>
├─ <module>.module.ts
├─ <module>.controller.ts
├─ <module>.service.ts
├─ dto
├─ entities 或 types
└─ README.md
```

约定：

- controller 只处理 HTTP 层。
- service 负责业务逻辑、权限判断、事务和数据访问。
- Prisma 查询优先集中在 service，不要散落在 controller。
- 公共能力放 `common`，不要每个模块复制一份。
- 配置读取放 `config` 或通过 `ConfigService` 注入。

### Prisma

- schema 文件：`apps/server/prisma/schema.prisma`。
- migration 文件只通过 Prisma 命令生成，不手写改历史 migration。
- Prisma Client 输出到 `apps/server/src/generated/prisma`，不要手改生成代码。
- Prisma 7 当前通过 `@prisma/adapter-pg` 在 `PrismaService` 里读取 `DATABASE_URL`，不要在 datasource 里写 url。
- model 使用 PascalCase，字段使用 camelCase，enum 使用大写枚举值。

### 数据库和权限

当前 schema 已包含用户、角色、权限、权限申请、部门和决策相关模型。后续扩展权限能力时优先沿用：

- `Role` / `Permission` / `UserRole` / `RolePermission`
- `UserPermission`
- `PermissionRequest` / `PermissionRequestItem`
- `DataScope`
- `PermissionEffect`

权限逻辑不要写死在页面里，前端只做展示和交互，真正权限判断放后端。

### 权限模型建议

权限不要继续无限细化到失控，先按“三层权限”收敛：

```txt
全局角色权限
  + 数据范围权限
  + 资源参与者权限
  + 用户临时授权/拒绝
  = 当前用户对某个决策的最终权限
```

推荐判断顺序：

1. 未登录直接拒绝。
2. 用户级 `DENY` 优先级最高。
3. 用户级临时 `ALLOW` 可覆盖角色不足，但要支持 `expiresAt`。
4. 角色权限判断用户是否拥有某个动作，例如 `decision:create`、`decision:update`、`decision:approve`。
5. 数据范围判断用户能操作哪些数据，例如 `ALL`、`DEPT`、`DEPT_AND_CHILD`、`OWN`、`PARTICIPATED`。
6. `ResourceParticipant` 判断用户在某个具体决策里的身份，例如 owner、editor、reviewer、viewer、approver。

MVP 阶段先实现：

- 角色权限：`Role` / `Permission` / `RolePermission`。
- 用户角色：`UserRole`。
- 决策参与者：`ResourceParticipant` 或后续拆成 `DecisionParticipant`。
- 数据范围：先支持 `ALL`、`DEPT`、`OWN`、`PARTICIPATED`。

后续再实现：

- 用户临时授权：`UserPermission`。
- 权限申请流：`PermissionRequest` / `PermissionRequestItem`。
- 自定义数据范围：`CUSTOM`。

### 数据模型建议

当前 schema 已经有方向，但还处在探索阶段，后续改之前优先按下面思路收敛。

近期建议修正：

- `Department.ecisions` 拼写应改为 `decisions`。
- `Post` 更像 demo 数据，决策主链路成型后可以移除，避免污染领域模型。
- 核心业务表建议补充 `updatedAt`。
- 常用外键建议补充索引，例如 `Decision.deptId`、`Decision.creatorId`、`Decision.ownerId`。
- `ResourceParticipant.role` 建议改成 enum，避免字符串随意漂移。
- `ResourceParticipant` 建议增加唯一约束，避免同一个用户在同一个资源重复参与。
- 如果项目数据还少，可以尽早考虑主键从自增 Int 切到 `cuid` / UUID，后期开源和多端同步更自然；如果暂时想保持简单，自增 Int 也可以继续用。

决策主链路推荐模型：

```txt
Decision
DecisionParticipant
DecisionTask
DecisionComment
DecisionEvent
DecisionMeeting
```

`Decision` 推荐承载核心状态：

- `title`
- `description`
- `status`
- `creatorId`
- `ownerId`
- `deptId`
- `decidedAt`
- `archivedAt`
- `createdAt`
- `updatedAt`

`DecisionEvent` 是项目亮点之一，建议设计成追加式日志：

- `decisionId`
- `actorId`
- `type`
- `payload Json`
- `before Json?`
- `after Json?`
- `createdAt`

回放功能第一版不需要复杂事件溯源，只要做到“关键操作全部写事件表，前端按时间线渲染，并能展示字段变化 diff”，面试时已经足够有深度。

## 共享 UI 包规范

`packages/ui` 面向多应用复用：

- 只放无业务语义的基础组件。
- 组件命名使用 PascalCase，文件名沿用当前小写风格，例如 `button.tsx`。
- 样式变体优先用 `class-variance-authority`。
- class 合并使用 `cn`。
- 不直接依赖 `apps/web` 或 `apps/admin` 的代码。
- 新增组件后检查 `exports` 是否能被应用正确引用。

## 代码质量要求

- 新增代码优先 TypeScript 类型明确，接口边界不要偷懒。
- 前端遵守 `strict: true`。
- 后端当前允许部分宽松 TS 配置，但新增业务代码尽量减少 `any`。
- 中文文档、注释和代码文件统一使用 UTF-8，避免出现乱码。
- 不强制写文件头注释；复杂逻辑写短注释说明原因，简单代码不用解释。
- 不提交 `.env`、`.next`、`dist`、coverage、临时调试文件。
- 删除代码前确认没有其他 app 或 package 依赖。

提交前建议执行：

```bash
pnpm lint
pnpm build
pnpm test
```

如果只改了某个 workspace，可以执行对应 filter 命令，减少等待时间。

## Git 和分支习惯

推荐分支命名：

```txt
feat/<feature-name>
fix/<bug-name>
refactor/<scope>
docs/<topic>
chore/<task>
```

提交建议小步提交：

- 一个提交只解决一个明确问题。
- 文档、样式、重构、功能尽量分开。
- 提交信息写清楚做了什么，例如 `feat(web): add dashboard shell`。

## 新功能开发流程

1. 先确认功能属于 `web`、`admin`、`server` 还是 `packages/ui`。
2. 设计数据流：页面 -> service -> BFF -> Nest controller -> service -> Prisma。
3. 先补类型和接口结构，再写 UI。
4. 后端新增接口时，同步写 DTO、错误处理和必要测试。
5. 前端新增页面时，至少处理 loading、empty、error、success 四种状态。
6. 涉及数据库时，生成 migration，并记录影响。
7. 完成后跑 lint/build/test 中和改动范围相关的命令。
8. 最后更新对应 README 或本文档。

## 个人项目边界

- 公司项目里的业务代码、客户数据、接口地址、地图数据、账号信息都不要进入本仓库。
- 可以复用自己掌握的通用工程经验，但不要复制公司私有实现。
- 个人项目优先做能公开展示的功能：仪表盘、权限系统、动画交互、可视化、编辑器、AI 辅助能力等。
- 每个阶段都尽量保留可截图、可演示、可讲述的成果。

## AI 协作约定

让 AI 助手改这个项目时，先让它阅读：

- 根目录 `PROJECT_GUIDE.md`
- 根目录 `package.json`
- 目标 app/package 的 `package.json`
- 相关源码目录和 README

协作要求：

- 先理解当前目录结构，再动代码。
- 保持现有技术栈，不随便引入新框架。
- 改动要小而清楚，避免顺手大重构。
- 生成文档和注释时使用中文，文件编码保持 UTF-8。
- 涉及 Next.js 16、React 19、Prisma 7 的细节时，优先查本地依赖文档或官方资料。
