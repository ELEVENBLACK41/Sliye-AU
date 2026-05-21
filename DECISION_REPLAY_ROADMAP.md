# Decision Replay Room 开发路线图

这个文档用于规划 NextNest 后续的产品方向和开发顺序。目标不是一开始做一个大而全的协同平台，而是先做出一条能演示、能讲清楚技术深度的核心闭环。

## 产品定位

项目方向暂定为：

> Decision Replay Room：一个支持音视频会议、临时提案、参与人投票、AI 摘要和全流程时间线回放的决策协作系统。

核心价值：

- 决策不是只留下最终结论，而是保留形成过程。
- 会议不是只录音录像，而是结构化成可搜索、可跳转、可复盘的事件时间线。
- AI 不是替人做决定，而是辅助提取提案、风险、行动项和会议纪要。

一句话演示：

```txt
创建一个决策 -> 拉人进入会议 -> 会中提出临时想法 -> 发起投票 -> 形成结论 -> AI 生成摘要 -> 回放页按时间线复盘全过程
```

## 当前项目基础

当前仓库已经具备这些基础：

| 范围 | 当前状态 |
| --- | --- |
| Monorepo | 根目录 pnpm workspace，包含 `apps/web`、`apps/admin`、`apps/server`、`packages/ui` |
| 前台 | `apps/web` 使用 Next.js 16、React 19、Tailwind CSS 4，已有 App Router 和 BFF 示例 |
| 管理端 | `apps/admin` 是独立 Next.js 应用，适合承载权限、用户、审计配置 |
| 后端 | `apps/server` 使用 NestJS 11、Prisma 7、PostgreSQL |
| 共享 UI | `packages/ui` 已有 Button、Badge、`cn` 等基础能力 |
| API 基建 | 后端已有统一响应拦截器和异常过滤器 |
| 数据模型雏形 | Prisma schema 已有 User、Role、Permission、Department、Decision、ResourceParticipant、PermissionRequest 等探索 |

当前主要缺口：

- 还没有真实的 `decisions` 业务模块。
- `test` 模块和 `Post` 模型还偏 demo。
- 权限模型有雏形，但还没有落成可运行的鉴权/授权流程。
- `Decision` 模型太薄，还不能支撑会议、提案、投票、回放。
- 没有 `DecisionEvent` 这类事件日志表，回放能力还没根。
- 音视频、录制、转写、AI 摘要都还没接入。
- Node 当前环境需要统一，Prisma 7 更建议使用 Node 22。

## 总体开发原则

最重要的顺序：

```txt
先做决策闭环
再做回放引擎
再接音视频
最后接 AI
```

原因：

- 没有决策、提案、投票、事件，音视频只是普通会议。
- 没有事件时间线，录像无法成为“决策回放”。
- 没有稳定数据结构，AI 摘要会变成一次性 demo。
- 每一阶段都必须有可截图、可演示、可讲述的成果。

开发时坚持：

- 能手动录入的，先手动录入。
- 能先模拟的，先模拟，再替换成真实服务。
- 每次只扩一个核心能力，不多线开坑。
- 所有关键动作都写 `DecisionEvent`。
- AI 输出必须经过人确认，不能直接成为正式决策。

## 推荐阶段

### Phase 0：工程基线整理

目标：让项目适合长期开发和开源。

优先任务：

- 统一 Node.js 版本，建议升级到 Node 22。
- 在根 `package.json` 增加 `engines`。
- 整理 `.env.example`，补齐 web、admin、server 的环境变量示例。
- 修复 README、注释、schema 中的编码和明显拼写问题。
- 后端增加全局 `ValidationPipe`。
- 后端接入 DTO 校验能力。
- 后端增加 API 前缀，例如 `/api/v1`。
- 增加 OpenAPI/Swagger，方便后续联调和开源展示。
- 把 demo seed 从业务 service 里拆出去。

验收标准：

- `pnpm lint` 能跑通或明确记录暂时失败原因。
- `pnpm build` 能跑通或明确记录暂时失败原因。
- 新人看根 README 和 `PROJECT_GUIDE.md` 能知道怎么启动项目。

暂时不要做：

- 不接音视频。
- 不接 AI。
- 不做复杂权限申请流。

### Phase 1：核心领域模型

目标：先把“决策回放”的数据库根基立住。

优先整理当前 schema：

- 修正 `Department.ecisions` 为 `decisions`。
- 给核心业务模型补 `createdAt`、`updatedAt`。
- `ResourceParticipant.role` 后续改成 enum，或拆成 `DecisionParticipant`。
- demo 用的 `Post` 后续可以移除，避免干扰领域模型。

第一批推荐模型：

```txt
Decision
DecisionParticipant
DecisionProposal
DecisionVote
DecisionEvent
DecisionTask
MeetingSession
```

建议状态枚举：

```txt
DecisionStatus:
  DRAFT
  DISCUSSING
  VOTING
  DECIDED
  ARCHIVED

ProposalStatus:
  OPEN
  ACCEPTED
  REJECTED
  CANCELLED

VoteOption:
  APPROVE
  REJECT
  ABSTAIN

MeetingStatus:
  SCHEDULED
  LIVE
  ENDED
  CANCELLED
```

`DecisionEvent` 是核心亮点，建议第一版就做：

```txt
id
decisionId
meetingId?
actorId?
type
title
payload Json
before Json?
after Json?
occurredAt
recordingOffsetMs?
createdAt
```

事件类型建议：

```txt
DECISION_CREATED
DECISION_UPDATED
PARTICIPANT_ADDED
MEETING_STARTED
MEETING_ENDED
PROPOSAL_CREATED
PROPOSAL_UPDATED
VOTE_STARTED
VOTE_CAST
VOTE_CLOSED
DECISION_CONFIRMED
TASK_CREATED
AI_SUMMARY_CREATED
```

验收标准：

- Prisma migration 能生成。
- 后端能创建一个决策。
- 创建决策时自动写入 `DECISION_CREATED` 事件。
- 能查询某个决策的事件时间线。

### Phase 2：无音视频的最小决策闭环

目标：先不用音视频，也能完整演示决策过程。

后端模块建议：

```txt
apps/server/src/modules/decisions
apps/server/src/modules/decision-events
apps/server/src/modules/users
apps/server/src/modules/permissions
```

第一批接口：

```txt
POST   /api/v1/decisions
GET    /api/v1/decisions
GET    /api/v1/decisions/:id
PATCH  /api/v1/decisions/:id
POST   /api/v1/decisions/:id/participants
POST   /api/v1/decisions/:id/proposals
POST   /api/v1/proposals/:id/votes
POST   /api/v1/proposals/:id/close
GET    /api/v1/decisions/:id/events
```

前台页面建议：

```txt
apps/web/src/app/(dashboard)/decisions/page.tsx
apps/web/src/app/(dashboard)/decisions/[id]/page.tsx
apps/web/src/app/(dashboard)/decisions/[id]/replay/page.tsx
```

页面能力：

- 决策列表。
- 决策详情。
- 添加参与者。
- 添加临时提案。
- 参与人投票。
- 决策状态流转。
- 时间线展示。
- 回放页按事件顺序展示全过程。

验收标准：

- 不开会也能演示完整决策闭环。
- 每个关键操作都能在 timeline 里看到。
- 回放页能讲清楚“谁在什么时候做了什么，为什么最终这样决定”。

暂时不要做：

- 不做真实 WebRTC。
- 不做 AI 实时总结。
- 不做复杂团队空间和多租户。

### Phase 3：Admin 最小权限后台

目标：让项目具备企业级后台味道，但不陷入权限深坑。

admin 第一版只做：

- 用户列表。
- 部门树。
- 角色列表。
- 权限码列表。
- 角色权限矩阵。
- 决策审计事件列表。

权限判断先收敛成：

```txt
角色权限
  + 数据范围
  + 决策参与者身份
  = 是否允许操作
```

MVP 先支持这些权限码：

```txt
decision:create
decision:view
decision:update
decision:delete
decision:participant:add
decision:proposal:create
decision:vote
decision:confirm
decision:replay:view
admin:user:manage
admin:permission:manage
audit:view
```

数据范围先支持：

```txt
ALL
DEPT
OWN
PARTICIPATED
```

验收标准：

- 普通成员只能看自己参与或自己创建的决策。
- 管理员能看所有决策和审计事件。
- 后端真正拒绝越权请求，前端只做展示控制。

暂时不要做：

- 不先做 `PermissionRequest` 复杂审批。
- 不先做 `CUSTOM` 自定义范围。
- 不做太复杂的策略编辑器。

### Phase 4：会议房间 v0

目标：把“决策详情”升级为“决策会议室”。

先做会议数据，不急着真实音视频：

```txt
MeetingSession
MeetingParticipant
MeetingAgenda?
```

页面建议：

```txt
apps/web/src/app/(dashboard)/decisions/[id]/room/page.tsx
```

第一版房间能力：

- 点击“开始会议”，创建 `MeetingSession`。
- 会议状态从 `SCHEDULED` 变成 `LIVE`。
- 会中手动添加提案。
- 会中发起投票。
- 会中添加行动项。
- 点击“结束会议”，状态变成 `ENDED`。
- 会议开始、结束、提案、投票、行动项全部写入 `DecisionEvent`。

验收标准：

- 即使没有真实摄像头，也能演示“会中决策过程”。
- `DecisionEvent.meetingId` 能把事件和会议绑定。
- 回放页可以按会议过滤事件。

### Phase 5：真实音视频接入

目标：接入真正的音视频会议能力。

建议优先考虑 LiveKit，而不是一开始手写完整 WebRTC：

- LiveKit 适合房间、成员、音视频轨道。
- 后续可以做录制。
- 后续可以接 AI agent 或实时转写。
- 自己手写 WebRTC 可以作为学习点，但不适合作为第一版产品核心。

后端需要增加：

```txt
POST /api/v1/meetings/:id/livekit-token
```

前端房间页增加：

- 加入房间。
- 摄像头开关。
- 麦克风开关。
- 屏幕共享可以后做。
- 成员在线状态。

环境变量建议：

```txt
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

验收标准：

- 两个浏览器用户能进入同一个会议房间。
- 能看到成员进入和离开。
- 会议开始和结束仍然写入事件时间线。

暂时不要做：

- 不马上做复杂会议布局。
- 不马上做虚拟背景。
- 不马上做多人高并发优化。

### Phase 6：录制和媒体回放

目标：让回放页从“事件回放”升级为“事件 + 视频回放”。

新增模型：

```txt
MeetingRecording
ReplayMarker
```

`MeetingRecording` 建议字段：

```txt
id
meetingId
provider
recordingUrl
durationMs
startedAt
endedAt
status
metadata Json?
createdAt
```

关键设计：

- 会议开始时记录 `startedAt`。
- 每个 `DecisionEvent` 计算 `recordingOffsetMs`。
- 回放页点击事件，视频跳到对应时间点。

回放页能力：

- 左侧视频播放器。
- 右侧事件时间线。
- 点击 timeline event 跳转到视频时间。
- 视频播放时高亮对应事件。

验收标准：

- 会议录像能打开播放。
- 至少提案、投票、确认决策这些事件能跳转到对应录像时间。

### Phase 7：AI 转写和摘要

目标：把会议内容结构化，不让 AI 盖过主业务。

AI 先做会后能力，再做实时能力。

第一版：

- 会议结束后上传或读取录音。
- 生成转写文本。
- 生成会议摘要。
- 生成行动项候选。
- 生成风险点候选。
- 生成可能的提案候选。

新增模型：

```txt
TranscriptSegment
AiSummary
ActionItem
```

`TranscriptSegment` 建议字段：

```txt
id
meetingId
speakerId?
startMs
endMs
text
confidence?
createdAt
```

AI 输出原则：

- AI 可以生成候选提案，但必须人工确认后才写入正式 `DecisionProposal`。
- AI 可以生成候选行动项，但必须人工确认后才写入正式 `DecisionTask`。
- AI 摘要写入事件：`AI_SUMMARY_CREATED`。

验收标准：

- 会议结束后能生成摘要。
- 能从摘要中确认行动项。
- 回放页能同时显示视频、事件、转写片段。

### Phase 8：实时 AI 和高级协作

目标：做作品集里的高级亮点，但必须放在主链路稳定后。

可选能力：

- 实时转写字幕。
- AI 实时识别“这可能是一个决策点”。
- AI 实时识别风险、阻塞和行动项。
- 多人在线状态。
- 评论和投票实时推送。
- SSE 或 WebSocket 通知。

验收标准：

- 实时能力断开后不影响主流程。
- 所有 AI 建议都有人工确认入口。
- 实时事件最终仍然落到 `DecisionEvent`，保证可回放。

## 建议的开发顺序

最推荐的前 10 个开发任务：

1. 统一 Node 版本和环境变量示例。
2. 整理 schema，修正明显命名问题，移除或隔离 demo 模型。
3. 新增 `DecisionEvent`，先把事件时间线做起来。
4. 新增 `decisions` 后端模块，支持创建、列表、详情。
5. web 做决策列表和详情页。
6. 增加提案和投票模型。
7. web 决策详情页支持添加提案和投票。
8. 做 `/replay` 页面，按事件 timeline 回放。
9. admin 做用户、角色、权限矩阵的最小版本。
10. 做 `room` 页面，先用无音视频会议状态模拟会中流程。

完成这 10 步后，再开始真实音视频接入。

## MVP 演示脚本

第一版可以这样演示：

```txt
1. 管理员在 admin 创建用户、部门、角色。
2. 用户 A 在 web 创建一个决策：是否重构权限模块。
3. 用户 A 添加用户 B、用户 C 为参与者。
4. 进入决策会议室，开始会议。
5. 用户 B 提出临时提案：先抽离权限计算服务。
6. 用户 C 提出风险：本周上线窗口不足。
7. 用户 A 发起投票。
8. 三个参与者完成投票。
9. 提案通过，系统形成正式决策。
10. 系统生成行动项：用户 B 负责 schema，用户 C 负责 API。
11. 结束会议。
12. 打开回放页，按时间线查看整个过程。
13. 如果接入录制，点击“投票通过”直接跳到录像对应时间。
14. 如果接入 AI，查看 AI 会议摘要、风险点和行动项。
```

## 目录规划

后端建议模块：

```txt
apps/server/src/modules
├─ auth
├─ users
├─ departments
├─ permissions
├─ decisions
├─ decision-events
├─ meetings
├─ recordings
├─ ai
└─ audit
```

前台建议业务模块：

```txt
apps/web/src/features
├─ auth
├─ decisions
├─ meetings
├─ replay
├─ notifications
└─ ai
```

管理端建议业务模块：

```txt
apps/admin/src/features
├─ users
├─ departments
├─ roles
├─ permissions
├─ audits
└─ system
```

共享 UI 继续只放无业务组件：

```txt
packages/ui
├─ components
└─ lib
```

## 技术取舍

### 音视频

推荐路线：

```txt
MeetingSession 数据模型
  -> room 页面模拟会议
  -> LiveKit 房间和 token
  -> LiveKit 录制
  -> 录像和 timeline offset 绑定
```

不推荐第一版手写完整 WebRTC。可以后续单独做技术文章或实验分支，但主项目优先保证可完成。

### AI

推荐路线：

```txt
会后转写
  -> 摘要/风险/行动项
  -> 人工确认
  -> 实时转写
  -> 实时决策点识别
```

AI 能力要落到产品结构里，不要只做一个聊天框。

### 实时能力

推荐路线：

```txt
先轮询或手动刷新
  -> SSE 通知
  -> WebSocket 房间事件
  -> 在线状态和实时投票
```

实时能力是增强，不要阻塞主链路。

## 开源准备

后续准备开源前需要补齐：

- 清晰 README。
- 架构图。
- 本地启动指南。
- `.env.example`。
- 数据库 seed。
- Docker Compose，至少包含 PostgreSQL。
- 截图和演示 GIF。
- License。
- 贡献指南。
- 路线图和已知限制。

## 面试讲述主线

面试时不要说“我做了一个管理系统”，而是这样讲：

```txt
我做的是一个 Decision Replay Room。
它解决的是团队关键决策过程不可追踪的问题。
我把决策过程拆成会议、提案、投票、事件、回放和 AI 摘要。
后端用 NestJS 模块化承载领域逻辑，Prisma 建模，所有关键操作写追加式事件日志。
前端用 Next.js 做 web/admin 和 BFF，回放页可以把事件时间线和会议录像绑定。
权限上不是简单角色判断，而是 RBAC + 数据范围 + 决策参与者身份。
AI 只做辅助提取，正式决策仍然需要人确认。
```

这条线能同时展示产品思考、前端工程、后端建模、权限设计、实时协作、音视频和 AI，不会显得技术点是硬塞进去的。
