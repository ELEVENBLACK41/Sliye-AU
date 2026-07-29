# Decision Hub UI 设计规范与 Stitch 提示词

> 本文档用于在 Stitch 中继续生成 Decision Hub 的其他页面。所有页面必须延续当前新版工作台的视觉语言，同时遵守项目现有业务边界。

## 1. 使用方式

1. 在 Stitch 中上传当前 `/main` 页面截图作为视觉参考。
2. 先粘贴“全局母提示词”。
3. 再追加一个具体页面提示词，一次只生成一个页面。
4. 优先生成 `1440 × 1024` 桌面版本，再基于同一页面生成 `390 × 844` 移动版本。
5. 页面中的数据均使用真实感中文示例数据，不使用骨架块、Lorem Ipsum 或无意义英文占位。

## 2. 产品背景

Decision Hub 是一套记录和呈现“一项决策如何产生”的协作系统。核心链路包括：

- 创建议事空间；
- 邀请参与人并划分公开或私密讨论区；
- 通过群聊或会议讨论；
- 提交提案；
- 发起投票；
- 形成正式决议；
- 通过事件时间线和会议录像回放完整决策过程。

当前产品止于“形成正式决议并完成过程回放”。不要设计任务分配、行动项、项目执行进度、验收、工单、看板或决议后的执行闭环。

## 3. 设计关键词

- Warm editorial workspace
- Soft bento dashboard
- Calm decision intelligence
- Organic rounded geometry
- Warm ivory and graphite
- High-contrast yellow accent
- Light glass surfaces
- Clear information hierarchy
- Professional but not corporate
- Data-rich without looking crowded

整体感觉应像一本可以交互的现代决策档案，而不是传统后台管理系统。页面要克制、温暖、可信，具有编辑设计感和轻微未来感。

## 4. 视觉系统

### 4.1 色彩

| 用途 | 色值或效果 |
| --- | --- |
| 页面外层背景 | `#ADB4BE`，冷灰蓝 |
| 主画布起始色 | `#F3F5F5` |
| 主画布中间色 | `#F5F2E8`，暖象牙白 |
| 主画布高光色 | `#FFF4BD`，仅在右上角形成柔和黄色光晕 |
| 主文字 | `#292A27` |
| 深色卡片 | `#30312E` |
| 品牌强调色 | `#FFD653` |
| 次要文字 | 黑色 45% 至 60% 透明度 |
| 浅色卡片 | 白色 50% 至 75% 透明度 |
| 轻边框 | 白色 60% 或黑色 5% 至 10% |

黄色只用于当前状态、关键操作、选中项和重要数据，不要让整个页面大面积变黄。红色仅用于取消、撤销、危险操作和错误状态。

### 4.2 字体

- 英文标题、数字和品牌：Satoshi 风格的现代几何无衬线字体。
- 中文：Geist Sans、PingFang SC 或同等克制的无衬线字体。
- 页面大标题使用紧字距，字重 `500–600`。
- 大号统计数字使用轻字重、紧字距和等宽数字特性。
- 正文保持高可读性，避免过细字体。

### 4.3 圆角与边框

- 主画布：轻边框，桌面端接近全屏，不使用传统居中后台容器。
- 大型业务卡片：`24–30px` 圆角。
- 中型浮层和菜单：`20–26px` 圆角。
- 输入框、筛选器和操作按钮：胶囊形或 `14–18px` 圆角。
- 头像、图标按钮、状态点：圆形。
- 边框尽量轻，主要通过背景层级和留白区分区域。

### 4.4 阴影与材质

- 主画布使用大范围、低透明度阴影。
- 卡片以无阴影或极轻阴影为主。
- Dropdown、Dialog、Popover 使用暖白半透明背景、轻边框、背景模糊和较深但柔和的悬浮阴影。
- 深色卡片保持纯净，不使用高光塑料质感。
- 只允许页面背景使用柔和渐变，普通卡片不要堆叠复杂渐变。

### 4.5 图标

- 使用 Lucide 风格的线性图标，线条简洁，尺寸通常为 `16–20px`。
- 图标放在浅灰、白色或黄色圆形容器中。
- 不使用彩色插画式图标，不绘制自定义 SVG。
- 图标必须有业务含义，例如议事使用对话图标，决策使用分支图标，提案使用灯泡图标，投票使用投票箱或勾选图标，回放使用时间线或播放图标。

### 4.6 动效

- 动效时长控制在 `240–320ms`。
- 使用自然减速曲线，类似 `power3.out`。
- 导航选中块采用平滑滑动，而不是瞬间切换。
- 卡片 hover 只允许轻微上移、缩放或背景变化。
- Dropdown 从触发器方向轻微缩放和淡入。
- 尊重 reduced motion，不做持续晃动或装饰性循环动画。

## 5. 全局页面结构

### 5.1 桌面端

- 使用顶部主导航，不使用全局左侧边栏。
- 左侧为胶囊形 `Decision Hub` 品牌标识。
- 中间为白色半透明胶囊导航，选中项使用炭黑移动色块。
- 主导航包含：工作台、议事空间、决策中心、会议中心、过程回放、成员管理。
- 右侧为通知圆形按钮和用户头像按钮。
- 设置不放在主导航中，放入头像 Dropdown。
- 用户菜单包含：个人资料、账号设置、外观设置、通知设置、退出登录。

### 5.2 移动端

- 保留精简品牌、通知和头像入口。
- 主导航收进单独的菜单按钮，不与用户菜单混合。
- Bento 多栏布局降为单列，重要操作优先显示。
- Dialog 在窄屏使用底部 Sheet，筛选条件使用可收起区域。

### 5.3 页面状态

每个正式页面都要设计以下状态，并保持布局稳定：

- Loading：使用与真实卡片形状一致的骨架屏。
- Empty：说明当前为空的原因，并提供唯一明确的下一步操作。
- Error：显示简短错误说明与重试入口。
- Success：展示完整业务数据和必要的操作反馈。
- Forbidden：解释没有权限，不暴露无权查看的数据。

## 6. 通用组件语言

- Primary Button：炭黑底白字或黄色底炭黑字，胶囊形。
- Secondary Button：白色半透明底、轻边框、炭黑文字。
- Status Badge：短胶囊；讨论中使用黄色，已决议使用炭黑，草稿使用条纹或浅灰，结束和归档降低对比度。
- Filter：胶囊 Select、Search、Popover，不使用原生表单控件外观。
- Card：内容驱动尺寸，避免所有卡片等高造成空洞。
- Table：只用于强对齐数据；主要业务列表优先使用卡片或可扫描的行列表。
- Avatar Group：头像允许轻微重叠，超过数量以 `+N` 表示。
- Timeline：使用垂直主线、黄色当前节点、炭黑重要节点和浅灰普通节点。
- Tabs：用于详情页内部切换，不替代全局导航。
- Dialog：用于创建、编辑、投票和确认决议；复杂流程不要全部塞进一个超长弹窗。

## 7. 全局母提示词

每次生成页面时，先粘贴下面这段，再追加对应页面提示词。

```text
Design a responsive Chinese web application page for “Decision Hub”, a collaborative system that records how decisions are created through discussion, proposals, voting, formal resolutions, and timeline replay.

Use the uploaded dashboard screenshot as the strict visual reference. Preserve its warm editorial workspace style: a cool gray-blue outer background, a nearly full-screen warm ivory canvas, a subtle yellow glow in the upper-right corner, graphite text, translucent white surfaces, charcoal feature cards, and #FFD653 as the only strong accent color. Use organic 24–30px card radii, pill-shaped controls, thin low-contrast borders, restrained shadows, generous whitespace, Satoshi-like typography for English and numbers, and clean Chinese sans-serif typography.

Keep the global top navigation consistent across every page. Place the pill-shaped “Decision Hub” brand on the left, a translucent pill navigation in the center, and notification plus avatar controls on the right. Navigation items are 工作台、议事空间、决策中心、会议中心、过程回放、成员管理. Show the active route with a smoothly movable charcoal pill. Settings belong in the avatar dropdown, never as a primary navigation item.

Use Lucide-style outline icons. Use realistic Chinese product copy and believable sample data. Do not use lorem ipsum, generic dashboard charts, stock photos, decorative illustrations, a global left sidebar, heavy gradients, neon colors, glassmorphism everywhere, or dense enterprise-admin styling.

The product scope ends when a formal resolution is created and the decision process can be replayed. Do not add tasks, action items, execution tracking, project delivery progress, kanban boards, or post-resolution acceptance workflows.

Design desktop at 1440×1024 and ensure the structure can responsively collapse to 390×844. Include accessible hierarchy, semantic sections, clear focus states, and realistic loading, empty, error, and success states where relevant. All visible interface copy must be Chinese except the “Decision Hub” brand and intentional short English headings.
```

## 8. 页面提示词

### 8.1 议事空间列表

```text
Create the “议事空间” list page.

The page should help users scan all discussion spaces they can access. Use a large editorial heading “议事空间” with a short description and a yellow primary button “创建议事”. Add a compact pill search field and filters for 全部、进行中、已关闭、已归档.

Present spaces as an asymmetric bento list rather than a traditional admin table. Each space card must show: title, short purpose statement, ACTIVE/CLOSED/ARCHIVED status, public or private visibility, owner, participant avatar group, number of related decisions, last activity time, and a subtle arrow affordance. Use one larger highlighted active space card and several smaller cards. Add realistic examples such as “2027 产品路线规划”, “研发效能改进议事”, and “品牌升级评审”.

Use charcoal for one featured card, warm translucent white for normal cards, and yellow only for active status or primary action. Include a meaningful empty state for users who have not joined any discussion space.
```

### 8.2 议事空间详情

```text
Create the “议事空间详情” page for “2027 产品路线规划”.

Use a compact breadcrumb above a large title. The hero area should show status, visibility, owner, department, participants, creation date, and a short purpose statement. Provide permission-aware actions such as “发起决策”, “创建会议”, “邀请成员”, and a quiet more-actions menu.

Below the hero, create a two-column workspace. The wider column contains a discussion feed with real Chinese messages, replies, pinned messages, mentions, attachments, and system events. The narrower column contains discussion areas, including one public area and two private groups, plus compact lists of related decisions and upcoming or recent meetings.

Use internal tabs for 讨论、决策、会议、成员, but keep the discussion feed as the default. The composer should be a rounded warm-white panel with attachment, mention, and send controls. Clearly distinguish human messages, system events, and messages linked to decisions. Do not add task assignment or execution tracking.
```

### 8.3 决策中心列表

```text
Create the “决策中心” list page.

Use an editorial header with a large title, a short description, and a yellow “创建决策” button. Add pill filters for 全部、草稿中、讨论中、已形成决议、已结束, plus search, department, and owner filters.

At the top, show the same compact segmented percentage language used by the dashboard: labels above each segment and percentages inside. Below it, show decision records as highly scannable horizontal cards, not a dense table. Each card includes decision title, associated discussion space, status, scope, owner, participant avatars, proposal count, vote round count, last update, and decided date when available.

Use realistic records such as “是否将移动端作为 2027 年第一优先级”, “统一设计系统迁移方案”, and “季度预算调整原则”. Highlight DISCUSSING with yellow, RESOLVED with charcoal, DRAFT with a subtle diagonal stripe, and CANCELLED/ARCHIVED with low contrast.
```

### 8.4 决策详情

```text
Create the “决策详情” page for “是否将移动端作为 2027 年第一优先级”.

The top hero must show the decision status, title, background, associated discussion space, scope, department, owner, participant avatars, created time, and permission-aware actions. Use a clear charcoal status card with one yellow accent area.

Build the body as a structured decision workspace with internal tabs or anchored sections for 概览、提案、投票、正式决议、时间线. The overview shows the decision question, current stage, participants, and key context. The proposal section shows multiple proposal cards with OPEN/ACCEPTED/REJECTED/CANCELLED states, author, description, created time, and source meeting. The voting section shows method, anonymity, quorum, options, whether the current user has voted, and closed results. Never reveal live option counts while voting is still open.

The formal resolution section must be visually prominent and document-like. Show title, full resolution text, FINAL/INTERIM/SUPPLEMENT type, ACTIVE/SUPERSEDED/REVOKED state, source proposal, source vote, confirmer, and confirmation time. End with a vertical event timeline linking discussions, proposals, votes, meetings, and resolution events. Do not add post-resolution tasks.
```

### 8.5 提案与投票操作界面

```text
Create a focused proposal and voting interface inside a decision page.

The left side shows an open proposal with title, author, rationale, supporting notes, and discussion context. The right side is a compact voting panel using a charcoal card with yellow selection states. Support single-choice voting, an optional reason field, anonymous voting explanation, quorum information, and a clear confirmation step.

Show three distinct states: not voted, submitted successfully, and voting closed. During open voting, do not display live vote counts or imply which option is winning. After closing, show total ballots, quorum status, approved/rejected/tied/quorum-not-met outcome, and proportional result bars. Use calm language and avoid gamified election visuals.
```

### 8.6 会议中心

```text
Create the “会议中心” page.

The page manages meetings that support decision formation. Use a large heading, a yellow “创建会议” action, and filters for 全部、待开始、进行中、已结束、已取消. Do not create a generic calendar-only page.

Use a hybrid layout: a compact week strip across the top, a large highlighted next meeting card, and a chronological list of other meetings. Each meeting displays title, associated discussion space and decisions, SCHEDULED/LIVE/ENDED/CANCELLED status, date and duration, host, participant avatars, agenda count, and recording availability after completion.

Use yellow for the next or live meeting, charcoal for completed meetings with recordings, and translucent white for scheduled meetings. Include clear actions such as “进入会议”, “查看记录”, or “查看回放” according to state.
```

### 8.7 实时会议室

```text
Create a focused live meeting room for Decision Hub while preserving the same visual identity.

Use a darker charcoal workspace for video concentration, surrounded by the warm ivory application canvas. The main area contains one large active speaker video and a compact participant grid. Use a floating rounded control bar for microphone, camera, screen share, participants, more actions, and a red leave button.

Add a right collaboration panel with tabs for 议程、讨论、提案、投票. Allow users to view linked decisions, create a proposal, and open a vote without leaving the meeting. Show meeting title, live duration, recording status, participant count, and connection quality. Keep controls calm and professional, not styled like entertainment streaming software.
```

### 8.8 过程回放

```text
Create the “过程回放” page for a completed decision.

This page should tell the story of how the decision was formed. Use a cinematic but professional layout: a large meeting recording player on the left and a synchronized event timeline on the right. The active timeline event uses yellow and can jump the recording to the corresponding timestamp.

Timeline events include decision creation, participant changes, discussion milestones, proposal creation, vote opening and closing, meeting start and end, recording ready, and formal resolution creation. Add filters for 全部、讨论、提案、投票、会议、决议.

Below the player, show a document-like final resolution card and a compact relationship map connecting the discussion space, meetings, proposals, vote rounds, and final resolution. The relationship map must remain readable and restrained, not become a decorative network visualization. Do not include execution tasks after the resolution.
```

### 8.9 成员与权限管理

```text
Create the “成员管理” page inside the main web application, not a separate admin product.

Only authorized users can see this route. Use an editorial header and compact summary statistics for users, departments, roles, and pending access. Create internal tabs for 成员、部门、角色权限、访问审核.

Use a clean row-based member list with avatar, name, email, department, roles, access state, last active time, and a contextual action menu. Place search and filters in rounded translucent controls. Role details should use grouped permission cards rather than a huge checkbox matrix. Department hierarchy can use a shallow tree panel. Sensitive actions require a confirmation dialog.

Keep this page visually consistent with the warm bento workspace and avoid conventional blue enterprise-admin styling. Do not create a separate left admin sidebar.
```

### 8.10 个人资料与设置

```text
Create the account area reached from the avatar dropdown.

Use a two-column settings layout inside the warm canvas. The narrow local navigation contains 个人资料、账号设置、外观设置、通知设置. This is local page navigation, not the global application sidebar. The wider content area uses one primary rounded card per settings group.

The profile section shows avatar, display name, email, department, and short bio. Account settings show password and session security. Appearance settings provide light, dark, and system theme choices using visual preview cards. Notification settings use grouped switches for discussion mentions, decision changes, voting events, meeting reminders, and resolution updates.

Use the same charcoal, warm white, and yellow language. Keep destructive account actions visually separated at the bottom. Do not add organization-wide permissions here.
```

### 8.11 登录页

```text
Create the Decision Hub login page as a focused extension of the application visual system.

Use the cool gray-blue outer background and a large warm ivory canvas with a subtle upper-right yellow glow. Place a strong editorial introduction on the left explaining that Decision Hub records how important decisions are formed. On the right, use a compact translucent login card with email, password, sign-in button, forgot password, and registration entry.

Use one abstract CSS-based composition made from rounded charcoal and yellow shapes to suggest branching discussion paths becoming one resolution. Do not use stock photography, illustrations, or custom SVG artwork. Keep visible copy in Chinese except the Decision Hub brand.
```

## 9. Stitch 输出验收清单

生成每个页面后检查：

- 是否延续顶部胶囊导航，而不是生成传统左侧后台菜单；
- 是否使用暖象牙白、炭黑和单一黄色强调色；
- 是否存在清晰的中文业务文案和真实感数据；
- 是否准确表达议事、决策、提案、投票、决议和回放之间的关系；
- 是否错误加入任务、行动项、执行进度或看板；
- 是否把设置放进头像菜单，而不是主导航；
- 是否避免大面积渐变、霓虹色和过量玻璃效果；
- 是否能自然适配移动端，而不是简单缩小桌面页面；
- 是否为无数据、加载、错误和无权限场景预留合理结构；
- 是否保持重要操作高对比，危险操作与普通操作明确分离。

## 10. 推荐生成顺序

1. 议事空间列表
2. 议事空间详情
3. 决策中心列表
4. 决策详情
5. 提案与投票
6. 会议中心
7. 实时会议室
8. 过程回放
9. 成员与权限管理
10. 个人资料与设置
11. 登录页

先稳定列表页和详情页的组件语言，再生成会议室与过程回放这类结构差异较大的页面，最终整体一致性会更好。
