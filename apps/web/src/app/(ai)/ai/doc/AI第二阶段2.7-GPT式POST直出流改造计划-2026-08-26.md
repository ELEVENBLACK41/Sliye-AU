# NextNest AI 第二阶段 2.7 补充计划：GPT 式 POST 直出流与持久化恢复双通道改造

> 文档状态：v0.12，2.7-A 已按 UI-first 修订、B～D 已完成，E～F 代码已完成待浏览器验收，G～H 待后续执行，I 的灰度/正式回滚部分后置
> 创建日期：2026-08-26  
> 归属阶段：AI 第二阶段补充增量 2.7  
> 上位基线：`AI第二阶段实施计划-2026-08-25.md`  
> 文档目的：在不推翻第二阶段持久化、权限、队列、取消和故障恢复基建的前提下，把当前“数据库轮询后再推送”的主显示链路改造成类似 GPT 网页交互体验的“提交请求直接返回模型流”。  
> 执行约束：本文经老大确认前只用于评审；不得据此修改代码、契约、数据库或部署配置。

---

## 1. 结论先行

本次改造不重做 `AiThread / AiMessage / AiRun / AiEvent / AiStep / AiToolCall / AiSourceDependency`，也不放弃当前已经验证的幂等、单 Thread 单活跃 Run、输入排队、调整方向、停止、重试、执行租约、fencing、来源失权和断线补拉能力。

目标采用“双通道”架构：

```text
当前活跃页面
  POST /api/ai/threads 或 POST /api/ai/threads/:threadId/messages
    -> 创建/提交消息与 Run
     -> 同一个 POST 响应立即返回模型实际产生的 live delta 和 Run 事件
    -> 浏览器立即渲染

持久化与恢复
  PostgreSQL 继续保存 Thread、Message、Run、Event、Step、ToolCall 和来源依赖
  GET /api/ai/threads/:threadId/stream
    -> 继续承担刷新恢复、断线重连、深链接和其他标签页的 afterSequence 补拉
```

改造重点是更换“当前页面的实时传输主通道”，不是更换对话数据模型。

---

## 2. 为什么要改造

### 2.1 当前体验问题

当前模型输出经过以下链路后才显示：

```text
AI SDK textStream
  -> Runtime 累积文本
   -> 达到 120 字符或 400ms 后写入 AiEvent
  -> BFF 每 400ms 查询一次 NestJS 事件接口
  -> GET SSE 推送给浏览器
  -> reducer 合并文本
  -> Streamdown 渲染 Markdown
```

当前实现中存在两层显式批处理：

- Runtime 以“120 字符或 400ms”为文本落库阈值；
- BFF 的 SSE 以 400ms 为事件补拉间隔。

这会产生以下用户感知：

- 首段文本出现时间被创建 Run、Runtime 启动、首次落库和首次轮询共同拉长；
- 已经从模型供应商收到的文字不会立即进入浏览器，而是以较大段落集中出现；
- `await` 内部 HTTP 与数据库写入会向模型消费循环施加反压；
- 前端虽然支持增量渲染，但只能渲染已经到达的整段 `delta`，无法补救服务端上游的批量发送。

### 2.2 为什么不能只调整三个数字

把 `120` 调小、把两个 `400ms` 调短，可以缓解问题，但不能消除架构上的固定成本：

- 当前页面仍需先提交 JSON 命令，再建立独立 GET SSE；
- 每个订阅都持续经过“浏览器 -> Next BFF -> Nest 查询 -> PostgreSQL”的轮询；
- 轮询频率越高，空查询、连接与数据库压力越高；
- 文本实时性与数据库查询周期绑定，无法独立优化。

因此，参数调优适合作为临时缓解或对照实验，不作为本计划的最终目标。

### 2.3 为什么参考 GPT 式交互，但不声称复制 ChatGPT 内部实现

浏览器网络面板只能观察到 GPT 网页使用长时间保持的 `POST /conversation` 请求承载交互流，无法证明其内部数据库、消息队列、事件总线或保存时序。

本文只借鉴公开可验证的协议思想：

- OpenAI 官方文档说明，HTTP 请求可以通过 SSE 持续返回增量事件，而不必等待完整结果：<https://developers.openai.com/api/docs/guides/streaming-responses>；
- OpenAI 官方文档将持久化 Conversation state 与单次 Response 生成分开描述，说明“流式返回”和“对话保存”是可以独立设计的两层能力：<https://developers.openai.com/api/docs/guides/conversation-state>。

本文不会把未公开的 ChatGPT 内部实现写成事实，也不会为了表面模仿请求名称而牺牲当前系统的领域边界。

---

## 3. 改造目标与非目标

### 3.1 必须达到的目标

- 新会话首发和已有会话发送都由原 POST 请求直接返回实时事件；
- 主路径不再依赖 400ms 数据库轮询才能显示文本；
- 当前页面收到模型实际产生的 live delta 后立即更新现有消息画布；
- live delta 与数据库持久化事件通过稳定 `liveDeltaId + liveSequence` 关联，持久化回执不能导致正文重复渲染；
- 浏览器断开只关闭当前订阅，不取消或终止正在执行的 Run；
- 刷新、深链接、其他标签页和直出流中断后，仍可使用现有 `runId + afterSequence` 恢复；
- PostgreSQL 继续是 Thread、Message、Run、Event、工具、来源和终态的权威状态；
- 同一个持久化事件在直出流与恢复流之间可去重，不重复显示文本或工具状态；
- 保持现有页面信息架构、消息气泡、工具卡、引用空状态、输入队列、停止、重试和元数据交互；
- 不改变第二阶段只读 Agent 的产品边界。

### 3.2 明确不做

- 不删除现有 GET SSE 恢复接口；
- 不把真实会话整体迁回旧 `/api/chat` Mock；
- 不直接改用 `useChat()` 默认 Transport；当前领域事件、排队、调整方向、来源失权和 Run 状态不是 AI SDK UI Message Stream Protocol 的直接等价物；
- 不在本轮引入 Redis、BullMQ、Kafka、NATS 或新的外部基础设施；当前第二阶段仍以常驻、单实例 Node Runtime 为边界；
- 不为当前个人项目引入灰度发布、服务端 feature flag 或正式回滚流程；现阶段使用请求头分流和旧 JSON 兼容路径即可，后续有真实线上用户和部署复杂度时再单独评估；
- 不修改 Prisma 数据模型或历史 migration，除非实施时发现无法通过既有 JSON 事件字段表达必要的稳定标识，并需另行向老大确认；
- 不顺带解决侧栏列表、RSC 导航和所有页面请求数量问题；只处理发送、实时展示和恢复链路中与本改造直接相关的重复请求；
- 不通过前端定时拆字制造“打字机动画”来掩盖服务端延迟。

---

## 4. 目标架构

### 4.1 传输选择

保留现有领域事件协议，新增“POST 响应流 Transport”。浏览器使用 `fetch()` 发送 POST，并通过 `ReadableStream` 读取 SSE 格式的命名事件。

不使用原生 `EventSource` 发送 POST，因为 `EventSource` 只适用于 GET；恢复通道仍继续使用现有 `EventSource`。

建议事件类型：

| 事件 | 用途 | 是否需要持久化序号 |
| --- | --- | --- |
| `submission` | 返回 `threadId`、`messageId`、`runId`、投递状态和队列位置 | 否，来源是幂等提交结果 |
| `live-delta` | 返回模型刚产生的原始文本增量，当前页面立即渲染 | 否，使用 `runId + liveSequence + liveDeltaId` |
| `ai-event` | 返回已提交的 `AiEvent`；文本事件带对应 `liveDeltaId`，作为持久化确认和恢复来源 | 是，必须携带 `runId + sequence` |
| `run-status` | 返回当前 Run 快照与最后确认序号 | 使用最后确认 `sequence` |
| `stream-handoff` | 提示客户端主 POST 流结束并切换到 GET 恢复流 | 携带 `runId + afterSequence` |
| `stream-error` | 返回已开始流之后无法再使用 JSON 外壳表达的稳定错误 | 尽可能携带业务错误码和 requestId |

### 4.2 持久化优先级

本计划调整为“UI-first、异步持久化”的体验优先模式：

```text
模型 delta
  -> 生成 liveDeltaId + liveSequence
  -> 立即写入当前 POST 响应，浏览器按实际 delta 渲染
  -> 进入当前 Run 的有界持久化队列
  -> 异步批量写入 AiEvent，并携带同一 liveDeltaId
```

该模式相较于“提交后再推送”减少了模型到页面的内部提交延迟，但需要明确接受并控制异步持久化窗口：

- 页面展示不再被数据库写入和轮询周期控制；
- live delta 与持久化 `AiEvent` 通过稳定标识关联，恢复时可以去重；
- Run 结束前必须等待持久化队列冲刷完成；冲刷失败不得把 Run 标记为正常完成。

`40/100` 不再控制前端展示，只能作为持久化队列的批量参数候选；`live-delta` 不等待数据库提交。进程崩溃前尚未落库的短暂增量属于本方案必须显式处理的风险，不能继续用“已提交事件优先”的描述掩盖。

### 4.3 Runtime 与浏览器断开解耦

- Runtime 的 `AbortController` 只响应用户停止、租约失效和服务端超时；
- POST 响应断开只注销当前 live sink，不调用模型 abort；
- live sink 写入失败不得让 Run 失败；持久化队列仍由 Runtime 继续处理；
- 持久化队列异步运行但必须有界，Run 终态前要完成最后冲刷并报告持久化失败；
- 浏览器重连时使用最后确认 `sequence` 进入现有 GET SSE；
- 直出流断开恢复时，以最后持久化 `sequence` 补拉，并用 `liveDeltaId` 过滤已经展示过的 live delta；
- 慢客户端必须有有界缓冲；超过上限时关闭 live sink 并发送或记录 handoff，不能通过背压拖慢模型和事务。

### 4.4 新会话路由切换

新会话的 `threadId` 只有提交成功后才产生。`submission` 必须作为第一个业务事件尽快返回。

浏览器收到后：

1. 更新当前 Thread/Run 的客户端状态；
2. 将 URL 切换为 `/ai/:threadId`；
3. 保持同一条 POST 流继续消费，不因页面段切换而中断；
4. 侧栏按服务端结果局部插入或在合适时机刷新一次，避免与路由详情请求形成无意义并发。

为避免 `/ai -> /ai/:threadId` 路由切换卸载 Hook 后丢失流，新增 feature 内的 live stream coordinator/provider，按 `runId` 管理当前读取器和最后序号。它只服务 AI 工作区，不进入全局通用 store。

### 4.5 与队列、调整方向和后继 Run 的关系

- 提交结果为 `QUEUED` 且 `runId = null` 时，POST 只返回 `submission` 后结束；
- 当前 Run 终态释放队首后，工作区根据权威详情或终态事件识别 `nextRunId`，再为新 Run 建立主流或进入 GET 恢复流；
- `STEER` 仍由服务端有序取消旧 Run，不向已经开始的模型请求硬注入文本；
- 第一版不让一条 POST 连接无限跨越多个排队 Run，避免流所有权、错误归属和停止语义混乱；
- 停止与重试接口继续保持 Run 级命令；重试成功后复用同一 live stream coordinator 订阅新 Run。

---

## 5. 必须保持的既有不变量

- 相同用户、Thread 与幂等键只能创建同一条消息和同一个投递结果；
- 同一 Thread 同时最多一个非终态 Run；
- `AiEvent.sequence` 在单 Run 内单调递增且唯一；
- 执行租约、续租和 fencing 继续阻止停止后或过期执行器迟到写入；
- Thread 所有者、`ai:chat:use` 与来源读取权限继续由 NestJS 强制；
- 来源失权后，历史、实时流和恢复流都不得旁路泄漏正文、工具名称、工具结果或引用；
- 归档、置顶、标题和列表排序语义不变；
- 浏览器断开不取消 Run，用户主动停止才进入取消状态机；
- Run 最终正文必须等于按序拼接的持久化文本事件，终态收敛后历史接口返回同一内容；
- GET SSE 永不启动执行器，POST 重试也不得因重复连接启动第二个执行器。

---

## 6. 小步实施计划

每轮只执行一个边界明确的步骤。每步完成后同步说明改动、原因、验证结果和下一步建议，然后停止，等待老大检查和确认。

### 2.7-A：冻结直出流协议与基准

状态：🔁 已完成并按 UI-first 方案修订。

目标：只定义协议、性能基准和失败语义，不改变运行行为。

主要工作：

- 在 `@workspace/contracts/ai` 新增 POST 流事件联合类型、提交元数据和 handoff 结构；
- 增加 `live-delta` 及其 `liveDeltaId/liveSequence` 关联字段，区分即时展示与持久化确认；
- 明确哪些错误发生在响应头前、哪些错误只能作为 `stream-error` 事件；
- 明确 `submission`、`ai-event`、`run-status` 的顺序与重复规则；
- 增加纯协议编解码测试；
- 记录当前实现的首段可见时间、事件间隔、事件文本长度和空轮询次数，作为改造前基线。

不做：不改 Route Handler、不启动 live stream、不修改数据库。

验证：contracts 类型检查、协议单测、基线记录可复现。

完成标志：客户端和服务端对每一种帧、终态、断线和重放行为没有未决歧义。

实现记录：原有协议已在 2026-08-27 冻结；根据老大确认的 UI-first 方案，本次修订新增 `live-delta` 帧、持久化文本事件的 `liveDeltaId/liveSequence` 关联字段，并明确 live delta 立即展示、`AiEvent` 异步确认、恢复按持久化序号补拉和稳定标识去重。原改造前基线文档继续作为历史对照，不把 `40/100` 当作前端渲染阈值。

### 2.7-B：让 NestJS 返回已提交事件回执

状态：✅ 已完成。

目标：事件生产接口在事务提交后返回可直接推送的权威 `AiEvent`。

主要工作：

- 文本增量内部接口返回完整事件或稳定的事件投影，不再只返回 sequence；
- 工具开始、工具结束、Run 状态变化和终态接口提供本次事务新产生的事件回执，或提供统一的“提交后事件批次”返回结构；
- 不改变事件表、序号分配、租约 fencing 和权限规则；
- 补真实 PostgreSQL 用例，断言回执与数据库记录完全一致。

不做：不向浏览器推流，不改变现有 GET SSE。

验证：AI 模块定向单测、持久化集成测试、contracts/server 类型检查。

完成标志：Runtime 无需等待下一次轮询就能拿到刚刚提交的权威事件。

实现记录：新增共享 Runtime 回执字段，文本增量接口在事务提交后返回完整 `AiEvent`；工具开始、工具结束和 Run 终态接口返回本次事务新提交的事件数组与最后序号；公共停止接口继续剥离内部事件，避免向浏览器暴露工具审计数据。新增/调整持久化与工具回归断言，逐字段核对回执和 PostgreSQL 记录一致。本轮未修改事件表、序号分配、租约 fencing、Route Handler 或 GET SSE，未进入 2.7-C。

### 2.7-C：抽离 Runtime live sink 与异步持久化队列

状态：✅ 已完成。

目标：让 Runtime 把模型实际产生的 live delta 立即发布给当前订阅者，同时异步持久化，不让数据库批次控制前端渲染；在没有订阅者时保持后台执行行为。

主要工作：

- 为 `startAiAgentRun` / `runAiAgentExecution` 增加可选、单职责的 live sink；
- sink 接收 live delta、已提交事件和状态快照，不参与权限和持久化；
- sink 关闭、超时或写入失败不影响模型执行和终态收敛；
- 设置有界缓冲和慢消费者策略；
- 新增按 Run 串行的异步持久化队列；前端 live delta 不等待队列冲刷，终态前必须等待最后一批持久化完成；
- `40/100` 只作为持久化队列的测量候选，不得作为前端 live delta 的聚合阈值。

不做：不接浏览器，不删除当前轮询 SSE。

验证：Mock 模型测试覆盖事件顺序、sink 断开、慢消费者、无 sink 后台执行和最终正文一致性。

完成标志：Runtime 在测试中能够按模型实际 delta 边执行边发布；持久化在后台有序完成，直出与恢复不重复，发布通道或持久化失败均按既定语义收敛。

实现记录：Runtime 已按模型实际到达的非空 delta 生成 `liveDeltaId + liveSequence`，先通过 live sink 直出，再交给按 Run 串行、有界的异步持久化队列；队列将多个 delta 聚合为带完整关联信息的 `AiEvent`，提交成功后作为确认事件发布。队列溢出或持久化失败会触发模型停止并阻止 Run 正常完成；正常终态前会等待所有已接受文本冲刷完成。原 `40/100` 只作为数据库批次候选，不控制前端展示；无 sink 时仍执行同一持久化与终态路径。本轮未接入浏览器 POST，不进入 2.7-D。

### 2.7-D：已有 Thread 的 POST 直出流

状态：✅ 已完成。

目标：先在没有路由创建问题的已有 Thread 上贯通最小真实闭环。

主要工作：

- `POST /api/ai/threads/:threadId/messages` 当前根据 `Accept: text/event-stream` 返回 SSE 格式的流式响应，未来如出现真实部署需求再评估是否增加受控 feature flag；
- 先完成 NestJS 幂等提交，再返回 `submission`；
- 有新 Run 时把 live sink 连接到当前 POST 响应，优先消费 `live-delta`；进入队列时返回提交结果后关闭；
- Route Handler 注册可等待的 Runtime Promise，保证客户端断开后执行仍由当前单实例 Node 进程托管；
- 保留原 JSON 响应模式用于回滚和兼容。

不做：不处理 `/ai` 新会话路由切换，不改 UI。

验证：Route Handler 流测试、重复幂等键测试、断开后 Run 继续完成、响应头前后错误路径测试。

完成标志：已有会话可以通过一个 POST 接收实时文本，且数据库历史和 GET SSE 补拉结果一致。

实现记录：`POST /api/ai/threads/:threadId/messages` 现在在调用方声明 `Accept: text/event-stream` 时，先复用既有 NestJS 幂等提交并发送 `submission`，再把当前 Run 的 `live-delta`、持久化 `ai-event`、终态 `run-status` 和 `stream-handoff` 通过同一条 SSE 响应返回；不带该 Accept 时保留原 JSON + `after()` 兼容路径。新增 POST 响应桥和流生命周期测试，客户端断开只关闭当前 sink，已注册的 Runtime Promise 仍由 `after()` 等待；直出流只消费当前 Run，后继排队 Run 交回无订阅者后台链，避免一条 POST 串入下一条回答。未修改 NestJS、Prisma、GET SSE、新会话路由或 UI。

### 2.7-E：浏览器 POST Stream Transport

状态：🧪 代码完成，待真实已有 Thread 浏览器验收。

目标：让现有工作区在已有 Thread 中消费 POST 直出流。

主要工作：

- 新增 feature 内 POST SSE parser 和 transport service；
- `use-ai-thread-commands` 提交后不再立即额外刷新详情和消息来发现新 Run；
- 复用现有 `AiEventReducerState` 和消息适配，不复制第二套文本/工具状态机；
- 记录最后持久化 sequence；流异常后自动 handoff 到现有 GET SSE；
- 保持当前 `MessageResponse`、工具卡、引用空状态和输入区视觉不变。

不做：不接新会话首发，不替换 `MessageResponse` 或引入新的聊天 UI。

验证：parser/reducer 单测、已有 Thread 发送人工验收、长 Markdown/代码块流式渲染检查。

完成标志：已有 Thread 主路径不再出现独立 GET stream，除非发生刷新、断线或主动 handoff。

实现记录：新增浏览器侧 POST SSE Transport，复用现有 BFF 请求认证刷新链路和 2.7-A 编解码器；提交 Promise 在 `submission` 到达后完成，继续在后台消费同一条 POST 流。`live-delta` 通过新增的 reducer 入口立即更新现有消息适配，持久化文本事件使用 `liveDeltaId` 去重；正常终态不额外建立 GET SSE，流错误、异常结束和恢复 handoff 会释放 POST 主流门禁并复用既有 `runId + afterSequence` GET SSE。已有 Thread 的 POST 期间通过本地投影立即显示用户消息和活跃 Run，不再依赖刷新详情/消息来发现新 Run；未修改新会话首发、聊天 UI 结构、灰度开关或数据库。

### 2.7-F：新会话首发与路由保持

状态：🧪 代码完成，待真实新会话浏览器验收。

目标：让 `/ai` 首条消息使用同一个 POST 流，并在取得 `threadId` 后安全切换 URL。

主要工作：

- `POST /api/ai/threads` 返回相同的流协议；
- 新增 AI feature 范围的 live stream coordinator/provider；
- `submission` 到达后更新 URL，但不销毁当前读取器；
- 处理路由 RSC、详情/消息请求和侧栏刷新之间的竞态；
- 只进行一次必要的侧栏同步，取消无意义的旧详情/消息启动。

验证：新会话首发、路由切换、浏览器前进后退、快速切换 Thread、重复点击门禁和刷新恢复。

完成标志：新会话从发送到结束保持同一 POST 主流，URL、侧栏和数据库历史一致。

实现记录：`POST /api/ai/threads` 现在在调用方声明 `Accept: text/event-stream` 时，把新 Thread 创建回执映射为统一 `submission` 并复用 2.7-D 的 POST 流响应；新增挂在 `(ai)` 稳定布局的 `AiPostStreamProvider`，通过事件回放让 `/ai` 到 `/ai/:threadId` 路由切换不销毁读取器。新会话在收到 `submission.threadId` 后再切换 URL，后续 live delta、确认事件和终态继续由新页面 Hook 接管；未修改聊天 UI、新会话产品边界、数据库或灰度配置。

### 2.7-G：队列、调整方向、停止与重试闭环

状态：🧪 代码与定向自动化验证完成，待真实浏览器验收。

目标：把第二阶段已有命令语义完整接入双通道。

主要工作：

- 排队消息返回提交结果后结束当前请求；
- 当前 Run 终态后识别 `nextRunId` 并为后继 Run 建立正确订阅；
- 调整方向期间旧 Run 与新 Run 的事件严格按 runId 隔离；
- 停止后不再显示迟到增量；
- 重试生成的新 Run 使用新流且保留 `retryOfRunId` 历史关系；
- 验证命令响应、直出流、GET 恢复流三者不会重复启动执行器。

验证：状态机单测、真实 PostgreSQL 竞争测试、浏览器排队/调整方向/停止/重试人工验收。

完成标志：现有命令能力在直出流下没有语义回退。

实现记录：终态状态帧补充事务已经领取的 `nextRunId`，客户端在已有 Run 收敛后继续通过权威详情进入后继 Run 的 GET 恢复流；POST 协调器新增 Run 归属过滤，旧 Run 的迟到增量、终态、handoff 和错误不会覆盖同一 Thread 的新 Run；停止后的终态状态不会把带后继 Run 的 Thread 错误清空；失败 Run 的重试继续复用同一 Thread 的恢复订阅路径。新增直出状态传递和 Run 隔离回归测试。

验证记录：Web AI Runtime 20 条、POST 协议与 Run 隔离 5 条、Server AI 队列/租约/重试相关 35 条、Web 类型检查、修改文件 ESLint 与 Prettier 均通过。真实浏览器的排队、调整方向、停止和重试写操作尚未执行，当前本地浏览器没有登录态，已保留登录页面等待授权后的验收。

### 2.7-H：性能、故障与安全门禁

目标：证明改造确实改善体验且没有牺牲可靠性。

主要工作：

- 对比改造前后的首段可见时间、稳定输出间隔、事件大小、数据库写入次数和空轮询次数；
- 验证主路径消除固定 400ms 轮询等待；
- 验证慢客户端不会拖慢 Runtime；
- 验证断网、刷新、服务端流异常、认证过期、多标签页、Thread 切换和来源失权；
- 验证前端最终正文、消息历史正文和按序事件拼接完全一致；
- 在 Node 22 目标环境执行定向类型检查、测试和真实浏览器验收。

完成标志：所有自动化与人工门禁通过，且实测结果优于改造前基线。

### 2.7-I：部署开关、灰度与清理（后置）

状态：⏸️ 后置，不阻塞当前个人项目开发。

目标：未来出现真实线上用户、多实例部署或需要降低发布风险时，再补齐部署开关、灰度观察和正式回滚；当前不把它作为 2.7 的交付门槛。

主要工作：

- 当前不增加 `AI_DIRECT_STREAM_ENABLED` 或同类环境变量；通过是否发送 `Accept: text/event-stream` 选择直出路径；
- 保留 JSON 命令 + GET SSE 旧路径作为低成本兼容和手动回退方式，不把它包装成灰度系统；
- 不删除 GET SSE 恢复接口；
- 未来确有部署需求时，再同步 `.env.example`、部署说明、观测指标和回滚门禁；
- 当前仅更新仓库二阶段实施计划和本 Obsidian 文档的实施状态。

验证：当前不执行灰度开关验证；仅验证 Accept 分流、JSON 兼容路径和 GET SSE 恢复链路不受影响。未来补开关时再验证切换无需数据库回滚。

完成标志：当前阶段明确不引入灰度/正式回滚系统，且直出与兼容路径边界已记录；未来需要时再独立启动本步骤。

---

## 7. 预计影响文件

以下是评审阶段的预计范围，实施时仍需每个小步骤重新核对引用关系。

| 层级 | 预计文件/目录 | 主要变化 |
| --- | --- | --- |
| contracts | `packages/contracts/src/ai/*` | 新增 POST 流事件、提交帧、handoff 和内部提交回执类型 |
| Web BFF | `apps/web/src/app/api/ai/threads/route.ts`、`[threadId]/messages/route.ts` | 支持流式 POST，同时保留 JSON 回滚路径 |
| Web Runtime | `ai-agent-runtime.server.ts`、`ai-run-dispatch.server.ts`、新增 live stream/sink 文件 | 发布已提交事件、管理响应生命周期和慢消费者 |
| Web 恢复流 | `ai-stream.server.ts` | 保留 afterSequence 补拉；可能复用通用 SSE 编码器 |
| Web services | `ai-thread-client.service.ts`、`ai-thread-stream.service.ts`、新增 POST stream transport | 分离普通 JSON 命令、直出流和恢复流 |
| Web hooks/store | `use-ai-thread-commands.ts`、`use-ai-thread-workspace.ts`、新增 feature coordinator/provider | 消费直出流、路由保持、handoff 与去重 |
| Web UI | `ai-workspace.tsx`、`ai-chat-surface.tsx` | 原则上只接状态，不改变视觉；必要时补轻量渲染节流 |
| Nest controller/DTO | `apps/server/src/modules/ai/controllers/*`、`dto/*` | 返回事务提交后的事件回执 |
| Nest services | `ai-event.service.ts`、工具调用和 Run 控制相关 service | 保持事务与 fencing，暴露本次提交事件 |
| 测试 | contracts/Web Node/Server Jest/PostgreSQL/browser | 协议、顺序、断线、幂等、权限、队列和性能门禁 |
| 配置文档 | AI 二阶段计划 | 当前记录 Accept 分流与 JSON 兼容路径；feature flag、部署和正式回滚后置 |

预计不需要 Prisma migration；如果实施过程中出现数据库结构需求，必须停止当前步骤并单独向老大确认。

---

## 8. 验收矩阵

| 场景 | 必须结果 |
| --- | --- |
| 新 Thread 首发 | 一个 POST 返回 submission 和实时事件；URL 安全切换；只创建一个 Thread/Message/Run |
| 已有 Thread 发送 | 一个 POST 作为主流；不额外 GET 详情/消息来发现 Run |
| 正常完成 | UI 正文、事件拼接和历史正文一致；Run 为 COMPLETED |
| 浏览器中途断网 | Run 继续执行；重连后从最后 sequence 补拉，无重复无缺字 |
| 刷新页面 | 详情与历史恢复；活跃 Run 由 GET SSE 继续订阅，不重复启动 |
| 多标签页 | 只有提交标签页使用 POST 主流；其他标签页通过 GET SSE 安全观察 |
| 慢客户端 | Runtime 不被阻塞；必要时关闭 live sink 并 handoff |
| 认证失效 | 响应头前可刷新并用同一幂等键重试一次；流开始后进入受控错误与恢复路径 |
| 排队消息 | 返回 QUEUED 和 queueSequence 后结束，不伪造活跃流 |
| 调整方向 | 旧 Run 有序取消，新 Run 事件不串入旧消息 |
| 停止 | 取消请求后不接受迟到写入，最终状态由服务端确认 |
| 重试 | 新 Run 独立流式展示，旧 Run 保持历史终态 |
| 工具调用 | 工具开始、结束、失败顺序与数据库一致，不泄漏输入输出 |
| 来源失权 | 实时、恢复和历史三个出口都执行同一权限边界 |
| feature flag 关闭 | 完整回到现有 JSON 命令 + GET SSE 路径 |

---

## 9. 性能判定方式

不以“肉眼像不像逐字动画”作为唯一验收，而记录以下指标：

- `commandAcceptedAt -> firstVisibleTextAt`：命令被服务端接受到首段文本可见的时间；
- `modelDeltaReceivedAt -> browserFrameEnqueuedAt`：模型增量进入 Runtime 到写入浏览器流的新增平台延迟；
- 稳定生成期间的事件间隔分布与文本长度分布；
- 每个 Run 的 `AiEvent` 写入次数与总数据库时间；
- GET 恢复接口的空轮询次数；主路径应降为 0；
- 前端长回答、代码块、表格和 Mermaid 的渲染耗时；
- 直出文本、事件拼接和最终消息的哈希一致性。

第一版性能目标：

- 主路径移除固定 400ms 轮询等待；
- 稳定生成时不再以约 120 字符的大段作为常态显示单位；
- live sink 和浏览器断开不会增加模型失败率；
- 数据库写入放大处于可接受范围，并以真实测量决定最终批次阈值。

不承诺严格“一次一个汉字”，因为模型供应商和 AI SDK 的原始 delta 本身可能包含多个 token；如需逐字动画，应作为独立视觉需求评审。

---

## 10. 主要风险与应对

### 10.1 POST 流开始后无法改回 JSON 错误

应对：响应头前的认证、权限、参数和幂等错误继续使用统一 HTTP/JSON 错误；响应开始后的错误使用 `stream-error` 事件，并携带稳定业务码和 requestId。

### 10.2 路由切换导致新会话流被卸载

应对：live stream coordinator 放在 AI feature 的稳定布局/provider 生命周期中，读取器按 runId 管理，页面 Hook 只订阅状态。

### 10.3 数据库写入仍造成延迟

应对：UI-first 下 live delta 可以先于数据库可见，但必须带稳定 `liveDeltaId/liveSequence`；持久化队列按 Run 串行、有界并在终态前冲刷，失败时不得把 Run 标记为正常完成。恢复流只使用已提交 `AiEvent`，并按稳定标识去重。

### 10.4 慢客户端向 Runtime 反压

应对：live sink 有界缓冲；超限后断开当前 sink并切换恢复模式，绝不阻塞模型、租约续期和数据库事务。

### 10.5 多实例部署

应对：第二阶段继续遵守单实例常驻 Node 边界。未来多实例时，进程内 live sink 必须替换为 Redis/NATS 等跨实例事件通道，届时单独评审部署和运维成本。

### 10.6 前端 Markdown 重渲染

应对：先证明服务端大段批处理已消除；若长 Markdown 仍卡顿，再在 `MessageResponse` 周围增加 16～50ms 的展示节流或分层渲染，不把前端动画与服务端可靠性改造混为一步。

### 10.7 旧路径与新路径状态漂移

应对：live delta 与持久化 `AiEvent` 使用同一 `liveDeltaId` 关联；前端先渲染 live delta，收到确认事件后只确认不重复追加，恢复流继续按 `runId + sequence` 补拉。当前通过 `Accept` 请求头选择直出，未引入 feature flag；未来需要灰度时再补双路径一致性测试。

---

## 11. 兼容与后置回滚策略

- 当前不设置服务端灰度开关；客户端停止发送 `Accept: text/event-stream` 即继续走 JSON 命令 + GET SSE，不需要数据库回滚；
- 改造期间不删除现有恢复接口、事件表或 reducer；
- 每个步骤保持可独立回退，不跨步骤批量删除旧实现；
- 如发现消息缺失、重复、权限旁路、Run 被重复启动或浏览器断开导致执行取消，暂停继续启用直出请求并回到 JSON + GET SSE 路径；
- 只有完整验收后才清理被证明无用的重复刷新与前端旧 Transport 代码；正式灰度和自动回滚以后续部署专项为准。

---

## 12. 待老大确认的方案决策

- [x] D2.7-01：同意采用“POST 直出为主、GET SSE 负责恢复”的双通道方案；
- [x] D2.7-02：同意保留现有领域事件协议，不直接迁移到 `useChat()` 默认协议；
- [x] D2.7-03：同意采用 UI-first：模型 delta 先通过 POST 直出，`AiEvent` 异步持久化并作为恢复确认来源；
- [x] D2.7-04：同意第二阶段继续保持单实例 Node Runtime，不在本轮引入 Redis 或消息队列；
- [x] D2.7-05：确认当前个人项目不增加 feature flag 和正式灰度/回滚流程；保留旧 JSON + GET SSE 作为低成本兼容和手动回退路径，未来有线上部署需求时再单独评估；
- [x] D2.7-06：同意按 2.7-A～I 每轮只实施一个最小步骤，每步完成后停下等待检查；
- [x] D2.7-07：同意使用 `liveDeltaId + liveSequence` 关联即时增量与持久化事件，恢复按持久化 `sequence` 补拉并去重。

2.7-F 代码已完成，待在真实新会话上完成首发、URL 切换、快速切换/刷新恢复和最终历史一致性的浏览器验收；2.7-E 的已有 Thread 浏览器验收也仍需补齐，验收通过后再进入 **2.7-G：队列、调整方向、停止与重试闭环**，不自动进入后续步骤。
