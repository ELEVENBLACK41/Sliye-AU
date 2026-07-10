# AGENTS.md

本文件是给 AI/Agent 的项目级协作说明。改代码前先读这里，再按需阅读
根 `package.json`、目标 app/package 的 `package.json`
和相关目录 README。

## 项目概览

- Monorepo：`apps/web`、`apps/admin`、`apps/server`、`packages/ui`、`packages/contracts`，admin端暂时停止开发
- 前端：Next.js App Router，业务模块放 `src/features/<module>`。
- 后端：NestJS + Prisma，业务模块放 `apps/server/src/modules/<module>`。
- 包管理：pnpm workspace，Node 版本以 `.node-version` / `.nvmrc` 为准。

## 项目说明

- 本项目是个个人项目，其目的主要是为了日后发展 拓展全栈技术，也是为了在简历上能留下一份好得个人项目，也是为了后续开源能为开源社区做出贡献，项目最终主要是想实现一个双端，web，app 端得一个决策记录系统，也可以不叫这个名字，我也没想好，主要是想实现一个决策记录得过程，后续主要是根据需求拉会，可以音视频开会，或者在群中讨论，讨论过程可以发议题或者是想法或者是决策最后投票之类的，一个决策得过程被记录了下来，后续还可以加入时间线回放，会议图谱之类得都可以。（待完善，会随着项目得进展不断新增功能或者删减/改变功能，如果你有更好得想法也可以跟我说），另外，admin端暂时不做了 将权限以及用户管理之类的模块打算放进web端 当成一个功能模块去做，admin端的开发暂时停止。

## 协作原则

- 先理解目录结构和现有写法，再动代码。
- 页面都默认用中文。
- 暂时冻结 admin端，以模块形式先写进web端，以后没我得允许就不写admin了 只在web端写，后续根据权限去展示数据和模块以及功能
- 每次新增 package下的ui不要自己写 要安装shadcn ui
- 对于 包括但不限于 Select、Dialog、Popover、Tabs、Switch、Checkbox、Radio、Textarea 等等这类高强度复用的简单基础组件，一律优先使用 shadcn/Radix 组件，不要在业务页面里手写原生控件和样式；如果 `packages/ui` 里没有，先补 shadcn 组件再在业务中复用。
- 书写页面的时候要注意语义化。
- 保持当前技术栈，不随便引入新框架或重型依赖，如果真实需要得话询问我
- 改动要小而清楚，不顺手做大重构。
- 不做顺便的事情，且我未明确要求的修改。
- 中文文档和注释使用 UTF-8；复杂逻辑写注释说明原因，每个函数前都要写注释，新建文件的时候也要在文件头写明这个文件是干什么的
- 不提交 `.env`、`.next`、`dist`、coverage、临时调试文件。
- 删除或移动代码前，先确认没有其他 app/package 依赖。

## 分层习惯

- 页面和布局放在 `src/app`。
- 业务代码优先放在 `src/features/<module>`，内部可按 `components`、`hooks`、`services`、`store`、`types` 分层。
- 跨多个业务使用的组件放 app 内 `src/components`。
- 跨 `web/admin` 复用且无业务语义的基础组件，才沉淀到 `packages/ui`。
- `packages/ui` 只放基础 UI 和工具，优先复用 shadcn/Radix/lucide 风格；class 合并使用 `cn`。

## API 与 contracts

- `packages/contracts` 是前后端共享类型契约包，包名 `@workspace/contracts`，在写这个的时候也要写注释。
- API 请求体、响应体、跨端共享枚举、认证用户、token 等结构放进 contracts。
- 页面表单、组件 props、后端实体、Prisma model、Nest 上下文、store 状态不要放进 contracts。
- contracts 只导出类型，不写请求函数、不放业务实现、不依赖 app 代码，共享类型也要写详细的备注
- 调用方使用 `import type`，例如：

```ts
import type { LoginRequestPayload } from '@workspace/contracts/auth';
import type { ApiResponse } from '@workspace/contracts/common';
```

- 后端 DTO 可以 `implements` 共享契约；DTO 仍负责 Nest/class-validator 等运行时校验。
- 前端服务层复用 contracts 的请求/响应类型，UI 表单类型保留在 feature 内。
- 每一个类型都要写注释，不然就忘了

## 请求链路

推荐链路：

```txt
Browser / SSR
  -> apps/web Route Handler 或 BFF
  -> apps/server NestJS API
  -> Prisma
  -> PostgreSQL
```

- 浏览器侧优先请求 Next.js 自身 `/api/*`，由 BFF 转发到 NestJS。
- 不在浏览器直接暴露后端内部地址，除非接口明确设计为公开接口。
- `apps/web/src/services/request.ts` 是前端请求入口；feature 内接口调用放 `features/<module>/services`。
- Nest service 返回真实业务数据，统一响应外壳由全局拦截器处理。
- 处理的异常等统一的最好能够写出枚举之类的 方便服复用，且理解代码。 
- controller 保持薄，只做路由、参数接收和调用 service。
- 每一个接口也要写注释。

## 后端习惯

- 新模块放 `apps/server/src/modules/<module>`。
- controller 只处理 HTTP 层；service 负责业务逻辑、权限判断、事务和数据访问，业务逻辑也需要写注释。
- Prisma 查询优先集中在 service，不散落在 controller。
- 公共能力放 `common`，配置读取放 `config` 或通过 `ConfigService` 注入。
- Prisma migration 只通过 Prisma 命令生成，不手改历史 migration；不要手改 generated client。
- 权限判断放后端，前端只做展示和交互。

## 前端习惯

- App Router 默认 Server Component；只有需要交互状态、浏览器 API、事件监听、动画或客户端状态时才加 `'use client'`。
- 根据场景选择当前最优方式,例如客户端组件与服务端组件
- 获取方式根据当前页面得数据量来放骨架，且如果是服务端组件得话骨架要能根据接口返回数据得时间相应，例如我得理解应该是SSR，服务端实时推送html字符串给前端渲染，根据场景选择
- 数据获取根据场景和复杂程度判断服务端获取还是客户端获取，交互型数据再放 client 侧。
- 优先 Tailwind CSS 4 和已有 CSS 变量。
- 按钮、Badge、基础控件优先复用 `@workspace/ui`。
- 新页面至少处理 loading、empty、error、success 四种状态。

## 常用命令

根目录：

```bash
pnpm dev
pnpm dev:web
pnpm dev:admin
pnpm dev:server
pnpm build
pnpm lint
pnpm test
```

按 workspace：

```bash
pnpm --filter @nextnest/web dev
pnpm --filter @nextnest/admin build
pnpm --filter @nextnest/server test
pnpm --filter @workspace/ui check-types
pnpm --filter @workspace/contracts check-types
```

Prisma 命令建议在 `apps/server` 下执行：

```bash
pnpm prisma migrate dev
pnpm prisma generate
pnpm prisma studio
```

## 完成前检查

- 如果改动量很小，不用每次都跑检查，没必要。
- 优先跑与改动范围相关的 lint/build/test/typecheck。
- 涉及环境变量时，同步更新 README 或项目说明，并提醒需要重启 dev server。
- 涉及 contracts 时，同步检查 server、web/admin 引用是否仍然通过类型检查。
- 代码格=格式就按照我文件.prettierrc的规则就行
