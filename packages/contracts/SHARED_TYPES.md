# 共享类型设计与使用说明

`packages/contracts` 是 monorepo 内的共享契约包，包名为
`@workspace/contracts`。它用于沉淀前端、后端、管理端都需要共同遵守的
TypeScript 类型，例如 API 请求体、API 响应体、认证用户结构和 token 结构。

## 为什么这样设计

### 1. 把“接口契约”放在应用之外

`apps/server`、`apps/web`、`apps/admin` 都会关心同一批数据结构：

- 后端需要知道接口接收什么请求体、返回什么响应体。
- 前端需要知道请求参数怎么组装、响应数据怎么读取。
- 管理端也可能复用同一套用户、认证、通用响应类型。

如果这些类型分别写在各个 app 里，很容易出现字段漂移：后端改了字段名，
前端本地类型却没跟着改，直到运行时才暴露问题。把类型放到
`packages/contracts` 后，所有应用引用同一个来源，字段变化会在 TypeScript
检查阶段暴露出来。

### 2. 只放类型，不放业务实现

当前 `@workspace/contracts` 只导出 `type`：

```ts
export type * from './auth';
export type * from './common';
```

这样做有几个好处：

- 不把后端实现、前端状态、UI 组件混进契约层。
- 不产生运行时依赖，减少打包和循环依赖风险。
- 让这个包保持稳定：它描述“双方约定的数据形状”，而不是“某端如何实现业务”。

### 3. 按业务域拆分导出

包内使用子路径导出：

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./auth": "./src/auth/index.ts",
    "./common": "./src/common/index.ts"
  }
}
```

因此调用方可以按领域引入：

```ts
import type { LoginRequestPayload } from '@workspace/contracts/auth';
import type { ApiResponse } from '@workspace/contracts/common';
```

这样比从一个巨大入口导入更清晰，也方便后续继续扩展 `user`、`billing`、
`course` 等领域契约。

### 4. 后端 DTO 实现共享契约

后端的 Nest DTO 可以 `implements` 契约类型：

```ts
import type { LoginRequestPayload } from '@workspace/contracts/auth';

export class LoginDto implements LoginRequestPayload {
  email!: string;
  passwordCiphertext!: string;
  passwordKeyId!: string;
  nonce!: string;
}
```

这表示 DTO 的字段必须满足共享契约。DTO 仍然可以保留 Nest 侧需要的 class
形态、校验装饰器、转换逻辑；共享包只负责约束字段结构。

### 5. 前端复用 API 类型，但保留 UI 表单类型

前端可以直接复用请求和响应类型：

```ts
import type {
  LoginApiResponse,
  LoginRequestPayload,
} from '@workspace/contracts/auth';
```

但不是所有前端类型都应该放进 contracts。例如登录表单里可能有明文
`password` 字段，而真实接口发送的是加密后的 `passwordCiphertext`：

```ts
export type LoginFormValues = {
  email: string;
  password: string;
};
```

这类只服务 UI 的类型应继续留在前端 feature 内。`contracts` 只放跨端共同认可的
接口数据结构。

## 使用方式

### 安装关系

需要使用共享类型的 app，在自己的 `package.json` 中声明 workspace 依赖：

```json
{
  "dependencies": {
    "@workspace/contracts": "workspace:*"
  }
}
```

当前 `apps/web`、`apps/admin`、`apps/server` 已经这样配置。

### 引入通用响应类型

```ts
import type { ApiResponse } from '@workspace/contracts/common';

type UserListResponse = ApiResponse<User[]>;
```

`ApiResponse<T>` 的结构是：

```ts
export type ApiResponse<T> = {
  code: number;
  message?: string;
  data: T;
  timestamp?: number;
};
```

### 引入认证契约

```ts
import type {
  AuthSession,
  LoginApiResponse,
  LoginRequestPayload,
  RegisterRequestPayload,
} from '@workspace/contracts/auth';
```

常见用途：

- `LoginRequestPayload`：登录接口请求体。
- `RegisterRequestPayload`：注册接口请求体。
- `AuthUser`：认证用户结构。
- `AuthTokens`：访问令牌和刷新令牌结构。
- `AuthSession`：登录成功后的用户与 token 会话结构。
- `LoginApiResponse`：登录接口响应类型。
- `PasswordPublicKeyApiResponse`：密码加密公钥接口响应类型。

### 在 server 中使用

DTO 用 class，契约用 type。DTO 实现契约即可：

```ts
import type { RegisterRequestPayload } from '@workspace/contracts/auth';

export class RegisterDto implements RegisterRequestPayload {
  email!: string;
  name?: string;
  passwordCiphertext!: string;
  passwordKeyId!: string;
  nonce!: string;
}
```

如果 DTO 需要运行时校验，可以继续在字段上加 Nest/class-validator 装饰器；
这些运行时逻辑不放进 `contracts`。

### 在 web/admin 中使用

服务层请求和响应应优先引用 contracts：

```ts
import type {
  LoginApiResponse,
  LoginRequestPayload,
} from '@workspace/contracts/auth';

async function login(payload: LoginRequestPayload): Promise<LoginApiResponse> {
  return request.post('/auth/login', payload);
}
```

页面表单、组件 props、局部状态等前端专用类型，不需要上升到 contracts：

```ts
type LoginFormValues = {
  email: string;
  password: string;
};
```

## 新增共享类型的规则

新增类型时，先判断它是否属于“跨端契约”：

- 是接口请求体、响应体、跨端共享枚举或跨端共享数据结构：放进
  `packages/contracts`。
- 是页面表单、组件 props、后端实体、数据库模型、Nest guard 上下文、
  Zustand store 状态：留在对应 app 内。

推荐步骤：

1. 在 `packages/contracts/src/<domain>/` 下新增或修改类型文件。
2. 在该领域的 `index.ts` 中导出类型。
3. 如需新的子路径导入，在 `packages/contracts/package.json` 的 `exports`
   中增加入口。
4. 在调用方用 `import type` 引入。
5. 运行类型检查，确认 server 和 web/admin 都通过。

示例：

```ts
// packages/contracts/src/profile/profile.types.ts
export type UpdateProfileRequestPayload = {
  name?: string;
  avatarUrl?: string;
};
```

```ts
// packages/contracts/src/profile/index.ts
export type * from './profile.types';
```

```json
// packages/contracts/package.json
{
  "exports": {
    "./profile": "./src/profile/index.ts"
  }
}
```

```ts
import type { UpdateProfileRequestPayload } from '@workspace/contracts/profile';
```

## 边界约定

`contracts` 应该保持以下边界：

- 只定义数据形状，不写请求函数。
- 只定义跨端契约，不放某个 app 私有类型。
- 不依赖 `apps/server`、`apps/web` 或 `apps/admin`。
- 不放 React、Nest、Prisma、数据库实体等具体框架类型。
- 优先使用 `type` 和字面量联合类型，保持可移植。
- 导入时优先使用 `import type`。

一句话总结：`packages/contracts` 是前后端之间的“类型协议层”。它不决定业务怎么
运行，只确保所有应用对 API 数据结构有同一份、可被 TypeScript 检查的理解。
