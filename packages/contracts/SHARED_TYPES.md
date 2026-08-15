# 共享契约设计与使用说明

`packages/contracts` 是 monorepo 内的前后端共享契约包，包名为 `@workspace/contracts`。它只描述跨端共同遵守的数据形状和只读代码目录，不包含请求函数、数据库访问、组件状态或业务实现。

## 导出入口

```ts
import { API_ERROR_CODES, API_SUCCESS_CODE } from '@workspace/contracts/common';
import {
  SYSTEM_PERMISSION_CODES,
  SYSTEM_PERMISSION_DEFINITIONS,
  SYSTEM_PERMISSIONS,
} from '@workspace/contracts/access';
import type {
  AccessDepartmentTreeNode,
  AccessRole,
  AccessUser,
  GrantableDataScope,
  SystemPermissionCode,
} from '@workspace/contracts/access';
import type { AuthUser, LoginRequestPayload } from '@workspace/contracts/auth';
import type { CreateDecisionRequestPayload, DecisionDetail, DecisionSummary } from '@workspace/contracts/decisions';
```

当前支持以下子路径：

- `@workspace/contracts/common`：统一成功与错误响应、稳定业务码。
- `@workspace/contracts/access`：系统权限目录、系统角色目录、RBAC、部门树和授权审计。
- `@workspace/contracts/auth`：登录、注册、令牌和当前认证用户。
- `@workspace/contracts/decisions`：最小决策列表、详情与创建请求。

## 允许的只读运行时常量

契约包通常只导出类型，但权限 V2 允许导出无副作用的只读常量，作为跨端唯一事实来源：

- `SYSTEM_PERMISSION_DEFINITIONS`：权限名称、模块、动作、说明和允许范围。
- `SYSTEM_PERMISSION_CODES`：用于输入校验和漂移检查的权限码数组。
- `SYSTEM_PERMISSIONS`：按业务语义分组的权限码对象。
- `SYSTEM_ROLE_DEFINITIONS`：四个系统角色与默认授权。
- `API_SUCCESS_CODE`、`API_ERROR_CODES`：统一响应业务码。

这些常量不得读取环境变量、访问网络或数据库，也不得依赖任何 `apps/*` 代码。权限目录同步由服务端显式命令执行，应用启动只能执行只读漂移检查。

## 统一响应

所有 JSON API 使用 `success` 可判别联合：

```ts
import type { ApiResponse } from '@workspace/contracts/common';

function readResponse<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    throw new Error(`${response.code}: ${response.message}`);
  }

  return response.data;
}
```

成功响应固定使用 `COMMON.OK`。失败响应使用稳定字符串错误码，并携带 `requestId`、`path` 和可选字段错误 `details`；未知异常不得把堆栈、SQL 或内部错误原文暴露给浏览器。

## 权限与数据范围

`AccessDataScope` 包含持久层可能存在的 `CUSTOM`，用于读取和迁移历史记录。所有新增授权 DTO 必须使用 `GrantableDataScope`，因此不能继续授予当前尚未实现的 `CUSTOM`。

角色权限以独立授权记录表达：同一个角色可以为同一权限保存多个不同数据范围。用户直接 `DENY` 只能使用 `ALL`，该约束由契约注释说明，并由服务端 DTO 与业务服务再次校验。

系统权限和系统角色只允许通过代码目录同步。业务接口只能创建和维护自定义角色或自定义权限，不能修改系统目录记录。

## 新增共享契约的规则

1. 仅放 API 请求体、响应业务数据、跨端枚举和纯只读代码目录。
2. 每个导出类型和每个字段必须写中文 JSDoc，新文件必须写中文文件头。
3. 后端 DTO 可以 `implements` 请求契约，但运行时校验仍由 Nest 与 `class-validator` 负责。
4. 页面表单、组件 props、Prisma model、Nest 请求上下文和 store 状态留在对应 app 内。
5. 新增领域入口后同步修改 `package.json` 的 `exports` 和根 `src/index.ts`。
6. 完成修改后运行 `pnpm --filter @workspace/contracts check-types`。
