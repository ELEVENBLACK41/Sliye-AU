# NextNest 数据结构说明

本文档描述当前 Prisma 数据模型的领域边界、ER 关系、外键含义和关键字段用途。当前设计面向第一阶段目标：先跑通 web 端注册、登录、会话刷新、用户身份识别，再承接 admin 权限管理和 Decision Replay Room 的决策闭环。

## 设计原则

- 单服务、单数据库优先：当前阶段不拆 auth-service、permission-service，也不拆库，降低开源启动成本。
- 模块化单体：通过 Nest 模块和清晰表边界，为后续拆服务保留空间。
- 用户身份和认证凭据分离：`User` 表表达业务用户，密码、第三方账号、会话和 token 独立建模。
- access token 短期有效，refresh token 支持 rotation：数据库只保存 refresh token 的哈希。
- 权限分三层：角色权限、用户特批/拒绝、数据范围/资源参与者。
- 决策回放以 `DecisionEvent` 为核心：所有关键操作都落到事件时间线。

## 表说明

| 表 | 含义 | 当前阶段用途 |
| --- | --- | --- |
| `User` | 业务用户主表 | 登录后的用户身份、部门归属、角色权限入口 |
| `UserPasswordCredential` | 密码凭据表 | 保存密码哈希，不把密码字段塞进 `User` |
| `AuthAccount` | 第三方账号绑定 | 预留 GitHub/Google 登录 |
| `AuthSession` | 登录会话 | 表示某台设备或某次登录 |
| `RefreshToken` | 刷新 token | 支持 refresh token rotation 和重放检测 |
| `EmailVerificationToken` | 邮箱验证 token | 注册后验证邮箱 |
| `PasswordResetToken` | 重置密码 token | 忘记密码流程 |
| `AuthAuditLog` | 登录审计日志 | 记录登录、注册、刷新、退出、失败原因 |
| `OutboxEvent` | 事务消息表 | 为后续邮件、通知、AI 任务、MQ 投递做准备 |
| `Department` | 部门树 | 支持部门数据范围权限 |
| `Role` | 角色 | admin、member、viewer 等 |
| `Permission` | 权限码 | 如 `decision:create`、`admin:user:manage` |
| `UserRole` | 用户角色中间表 | 用户和角色多对多 |
| `RolePermission` | 角色权限中间表 | 角色和权限多对多 |
| `UserPermission` | 用户级权限覆盖 | 临时授权、临时拒绝、细粒度权限 |
| `PermissionRequest` | 权限申请单 | 用户申请权限，管理员审批 |
| `PermissionRequestItem` | 申请单明细 | 一张申请单可包含多个权限 |
| `Decision` | 决策主表 | 决策标题、状态、负责人、部门 |
| `DecisionParticipant` | 决策参与者 | 明确谁参与了某个决策以及参与身份 |
| `ResourceParticipant` | 通用资源参与者 | 给非决策资源预留，如 meeting/audit |
| `DecisionProposal` | 决策提案 | 会议或讨论中提出的方案 |
| `DecisionVote` | 提案投票 | 每个参与者对提案投票 |
| `DecisionTask` | 决策任务 | 决策形成后的行动项 |
| `MeetingSession` | 决策会议 | 决策关联的会议场次 |
| `MeetingParticipant` | 会议参与人 | 记录谁参加了会议 |
| `DecisionEvent` | 决策事件时间线 | 回放、审计、diff、会议录像定位的核心表 |
| `Post` | demo 表 | 当前测试模块遗留，后续可删除或隔离 |

## 外键关系

| 来源字段 | 目标表字段 | 删除策略 | 说明 |
| --- | --- | --- | --- |
| `User.deptId` | `Department.id` | `SetNull` | 用户离开部门后保留用户 |
| `UserPasswordCredential.userId` | `User.id` | `Cascade` | 删除用户时删除密码凭据 |
| `AuthAccount.userId` | `User.id` | `Cascade` | 删除用户时解绑第三方账号 |
| `AuthSession.userId` | `User.id` | `Cascade` | 删除用户时清理会话 |
| `RefreshToken.sessionId` | `AuthSession.id` | `Cascade` | 会话撤销后清理 refresh token |
| `RefreshToken.replacedByTokenId` | `RefreshToken.id` | 默认 | 记录 token rotation 链路 |
| `EmailVerificationToken.userId` | `User.id` | `Cascade` | 用户删除后清理验证 token |
| `PasswordResetToken.userId` | `User.id` | `Cascade` | 用户删除后清理重置 token |
| `AuthAuditLog.userId` | `User.id` | `SetNull` | 用户删除后保留审计记录 |
| `Post.authorId` | `User.id` | `SetNull` | demo 文章作者删除后文章保留 |
| `UserRole.userId` | `User.id` | `Cascade` | 删除用户时删除角色绑定 |
| `UserRole.roleId` | `Role.id` | `Cascade` | 删除角色时删除用户绑定 |
| `RolePermission.roleId` | `Role.id` | `Cascade` | 删除角色时删除权限绑定 |
| `RolePermission.permId` | `Permission.id` | `Cascade` | 删除权限时删除角色授权 |
| `PermissionRequest.requesterId` | `User.id` | `Cascade` | 删除申请人时删除申请记录 |
| `PermissionRequest.approverId` | `User.id` | `SetNull` | 审批人删除后保留申请记录 |
| `PermissionRequestItem.requestId` | `PermissionRequest.id` | `Cascade` | 删除申请单时删除明细 |
| `PermissionRequestItem.permId` | `Permission.id` | `Cascade` | 删除权限时删除申请明细 |
| `UserPermission.userId` | `User.id` | `Cascade` | 删除用户时删除用户级授权 |
| `UserPermission.permId` | `Permission.id` | `Cascade` | 删除权限时删除用户级授权 |
| `UserPermission.sourceRequestId` | `PermissionRequest.id` | `SetNull` | 申请单删除后保留授权结果 |
| `Department.parentId` | `Department.id` | `SetNull` | 上级部门删除后子部门变成根部门 |
| `Decision.deptId` | `Department.id` | `Restrict` | 有决策的部门不能直接删除 |
| `Decision.creatorId` | `User.id` | `Restrict` | 创建人是审计信息，不能随便断 |
| `Decision.ownerId` | `User.id` | `SetNull` | 负责人删除后决策保留 |
| `DecisionParticipant.decisionId` | `Decision.id` | `Cascade` | 删除决策时删除参与人 |
| `DecisionParticipant.userId` | `User.id` | `Cascade` | 删除用户时删除参与记录 |
| `DecisionProposal.decisionId` | `Decision.id` | `Cascade` | 删除决策时删除提案 |
| `DecisionProposal.creatorId` | `User.id` | `Restrict` | 提案创建人用于审计 |
| `DecisionVote.proposalId` | `DecisionProposal.id` | `Cascade` | 删除提案时删除投票 |
| `DecisionVote.voterId` | `User.id` | `Cascade` | 删除用户时删除投票 |
| `DecisionTask.decisionId` | `Decision.id` | `Cascade` | 删除决策时删除任务 |
| `DecisionTask.creatorId` | `User.id` | `Restrict` | 任务创建人用于审计 |
| `DecisionTask.assigneeId` | `User.id` | `SetNull` | 执行人删除后任务保留 |
| `MeetingSession.decisionId` | `Decision.id` | `Cascade` | 删除决策时删除会议 |
| `MeetingParticipant.meetingId` | `MeetingSession.id` | `Cascade` | 删除会议时删除参会记录 |
| `MeetingParticipant.userId` | `User.id` | `Cascade` | 删除用户时删除参会记录 |
| `DecisionEvent.decisionId` | `Decision.id` | `Cascade` | 删除决策时删除事件 |
| `DecisionEvent.actorId` | `User.id` | `SetNull` | 操作人删除后事件保留 |
| `DecisionEvent.meetingId` | `MeetingSession.id` | `SetNull` | 会议删除后事件仍可保留 |
| `DecisionEvent.proposalId` | `DecisionProposal.id` | `SetNull` | 提案删除后事件仍可保留 |
| `DecisionEvent.taskId` | `DecisionTask.id` | `SetNull` | 任务删除后事件仍可保留 |

## 关键字段解释

### 用户与认证

| 表.字段 | 含义 |
| --- | --- |
| `User.email` | 登录邮箱，唯一 |
| `User.status` | 用户状态：待验证、正常、禁用、锁定 |
| `User.emailVerifiedAt` | 邮箱验证完成时间，为空表示未验证 |
| `User.lastLoginAt` | 最近登录时间 |
| `UserPasswordCredential.passwordHash` | 密码哈希，不能保存明文密码 |
| `UserPasswordCredential.passwordAlgo` | 密码算法，默认 `argon2id` |
| `EmailVerificationToken.sentTo` | 验证码发送到的邮箱 |
| `EmailVerificationToken.tokenHash` | 邮箱验证码哈希，不保存明文验证码 |
| `EmailVerificationToken.attemptCount` | 验证码尝试次数，用于防暴力猜测 |
| `EmailVerificationToken.lastSentAt` | 最近一次发送时间，用于限制重复发送 |
| `AuthSession.status` | 会话状态，支持主动退出和过期 |
| `AuthSession.expiresAt` | 会话过期时间 |
| `RefreshToken.tokenHash` | refresh token 哈希，数据库不保存明文 token |
| `RefreshToken.usedAt` | refresh token 是否已经被使用 |
| `RefreshToken.revokedAt` | refresh token 是否已经被撤销 |
| `RefreshToken.replacedByTokenId` | refresh token rotation 后的新 token |
| `AuthAuditLog.event` | 认证事件，如 `login.success`、`login.failed` |
| `AuthAuditLog.success` | 事件是否成功 |
| `AuthAuditLog.reason` | 失败或撤销原因 |
| `OutboxEvent.topic` | 事件主题，如 `auth.email.verify`、`decision.event.created` |
| `OutboxEvent.payload` | 要投递给邮件服务、通知服务或 MQ 的消息体 |
| `OutboxEvent.status` | 投递状态：待处理、处理中、已发送、失败 |
| `OutboxEvent.retryCount` | 重试次数 |
| `OutboxEvent.nextRetryAt` | 下次重试时间 |
| `OutboxEvent.sentAt` | 成功发送时间 |
| `OutboxEvent.errorMessage` | 最近一次失败原因 |

### 组织和权限

| 表.字段 | 含义 |
| --- | --- |
| `Department.parentId` | 上级部门，用于部门树 |
| `Permission.code` | 权限码，如 `decision:create` |
| `Permission.module` | 权限模块，如 `decision`、`admin` |
| `Permission.action` | 权限动作，如 `create`、`view` |
| `UserRole.assignedAt` | 用户获得角色的时间 |
| `RolePermission.grantedAt` | 角色获得权限的时间 |
| `UserPermission.effect` | 用户级覆盖：`ALLOW` 或 `DENY` |
| `UserPermission.scopeType` | 数据范围：全部、本人、部门、参与过等 |
| `UserPermission.expiresAt` | 临时权限过期时间 |
| `PermissionRequest.status` | 申请单状态 |
| `PermissionRequestItem.effect` | 申请授权或申请拒绝 |

### 决策主链路

| 表.字段 | 含义 |
| --- | --- |
| `Decision.status` | 决策状态：草稿、讨论中、投票中、已决策、已归档 |
| `Decision.creatorId` | 决策创建人 |
| `Decision.ownerId` | 决策负责人 |
| `Decision.deptId` | 决策所属部门 |
| `Decision.decidedAt` | 形成最终决策的时间 |
| `Decision.archivedAt` | 归档时间 |
| `DecisionParticipant.role` | 用户在决策里的身份 |
| `DecisionProposal.status` | 提案状态：开放、接受、拒绝、取消 |
| `DecisionVote.option` | 投票选项：同意、反对、弃权 |
| `DecisionTask.status` | 行动项状态 |
| `MeetingSession.status` | 会议状态 |
| `MeetingParticipant.joinedAt` | 进入会议时间 |
| `MeetingParticipant.leftAt` | 离开会议时间 |

### 事件回放

| 表.字段 | 含义 |
| --- | --- |
| `DecisionEvent.type` | 事件类型，如创建决策、投票、创建任务 |
| `DecisionEvent.title` | 给前端 timeline 展示的事件标题 |
| `DecisionEvent.payload` | 事件额外数据 |
| `DecisionEvent.before` | 变更前快照 |
| `DecisionEvent.after` | 变更后快照 |
| `DecisionEvent.occurredAt` | 事件发生时间 |
| `DecisionEvent.recordingOffsetMs` | 如果未来接入录像，表示事件对应视频偏移毫秒数 |

## 鉴权计算建议

后端判断权限时建议按以下顺序：

```txt
1. 未登录：拒绝
2. 用户状态不是 ACTIVE：拒绝
3. 用户级 DENY：最高优先级，直接拒绝
4. 用户级 ALLOW：检查是否过期，再检查数据范围
5. 角色权限：检查用户角色是否拥有目标 Permission
6. 数据范围：ALL / DEPT / DEPT_AND_CHILD / OWN / PARTICIPATED
7. 决策参与者身份：DecisionParticipant.role
```

JWT 中建议只放最小身份信息：

```json
{
  "sub": 1,
  "sessionId": "clx...",
  "email": "user@example.com"
}
```

不要把完整权限列表长期塞进 JWT。权限会被 admin 动态修改，后端应该按需查库或做短期缓存。

## MVP 落地顺序

1. `auth` 模块：注册、登录、刷新 token、退出登录、`/auth/me`。
2. `users` 模块：当前用户资料、用户状态。
3. `permissions` 模块：角色、权限码、用户角色绑定。
4. `decisions` 模块：创建决策、列表、详情、参与者。
5. `decision-events` 模块：关键操作写入时间线。
6. `admin` 端：用户、角色、权限矩阵、审计日志。

## 本地邮箱验证码

本地开发阶段不需要一开始接真实邮件服务，建议先用数据库落验证码，再用开发环境输出验证码。

```txt
注册
-> 生成 6 位验证码
-> 用 server secret 做 HMAC/SHA256
-> tokenHash 写入 EmailVerificationToken
-> sentTo 写入目标邮箱
-> expiresAt = now + 10 分钟
-> lastSentAt = now
-> 开发环境 console 输出验证码，或接口仅在 development 返回 devCode
```

验证时：

```txt
用户输入验证码
-> 同样 hash 后和 tokenHash 对比
-> 检查 expiresAt / usedAt / attemptCount
-> 成功后 usedAt = now
-> User.emailVerifiedAt = now
-> User.status = ACTIVE
```

建议限制：

- 同一个 token 最多尝试 5 次，超过后作废。
- 同一邮箱 60 秒内不能重复发送。
- 生产环境绝不返回明文验证码。
- 后续可用 Mailpit / MailHog 做本地 SMTP UI。

## Redis 和 MQ 演进

当前结构不依赖 Redis 或 MQ，但已经支持后续平滑接入。

Redis 适合做：

- 登录失败限流：`login:fail:${ip}:${email}`。
- 邮箱验证码冷却时间和短期缓存。
- refresh token 快速黑名单。
- 用户权限短期缓存。
- 在线状态和 WebSocket 房间状态。

MQ 或任务队列适合做：

- 发送邮箱验证码。
- 登录安全通知。
- 决策事件通知。
- AI 摘要生成。
- 审计日志异步归档。

`OutboxEvent` 的作用是把“业务写库”和“异步投递”拆开：

```txt
业务事务内：
  创建 User / EmailVerificationToken
  创建 OutboxEvent(topic = auth.email.verify)

后台 worker：
  扫描 PENDING OutboxEvent
  发送邮件或投递 MQ
  成功标记 SENT
  失败写 errorMessage 并设置 nextRetryAt
```

这样后续从本地 console 邮件切到 SMTP、BullMQ、RabbitMQ 或 Kafka 时，业务表不用大改。
