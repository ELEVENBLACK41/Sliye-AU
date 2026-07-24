/**
 * 本文件定义登录、注册、令牌刷新与当前认证用户的跨端数据契约。
 */

import type { SystemPermissionCode } from '../access/index.ts';
import type { ApiResponse } from '../common/index.ts';

/** 服务端用于加密登录或注册密码的临时公钥。 */
export type PasswordPublicKey = {
  /** 临时公钥的唯一标识。 */
  keyId: string;
  /** 客户端必须使用的密码加密算法。 */
  algorithm: 'RSA-OAEP-256';
  /** PEM 格式的 RSA 公钥。 */
  publicKeyPem: string;
  /** 临时公钥失效时间，使用 ISO 8601 字符串。 */
  expiresAt: string;
  /** 本次密码加密必须绑定的随机数。 */
  nonce: string;
};

/** 登录与注册请求共用的加密密码载荷。 */
export type PasswordPayload = {
  /** 使用临时公钥加密后的密码密文。 */
  passwordCiphertext: string;
  /** 加密密码时使用的临时公钥标识。 */
  passwordKeyId: string;
  /** 获取临时公钥时服务端下发的随机数。 */
  nonce: string;
};

/** 邮箱密码登录请求体。 */
export type LoginRequestPayload = {
  /** 用户登录邮箱。 */
  email: string;
} & PasswordPayload;

/** 用户注册请求体。 */
export type RegisterRequestPayload = {
  /** 新用户邮箱。 */
  email: string;
  /** 新用户显示名称。 */
  name?: string;
} & PasswordPayload;

/** 确认邮箱验证码的请求体。 */
export type ConfirmEmailRequestPayload = {
  /** 接收验证码的邮箱。 */
  email: string;
  /** 用户输入的邮箱验证码。 */
  code: string;
};

/** 重新发送邮箱验证码的请求体。 */
export type SendEmailVerificationRequestPayload = {
  /** 需要验证的用户邮箱。 */
  email: string;
};

/** 刷新认证令牌的请求体。 */
export type RefreshTokenRequestPayload = {
  /** 需要轮换的一次性刷新令牌。 */
  refreshToken: string;
};

/** 当前认证用户的账号状态。 */
export type AuthUserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED' | 'LOCKED';

/** 当前用户是否已具备进入业务区所需的基础授权。 */
export type AuthAccessState = 'PENDING_ASSIGNMENT' | 'READY';

/** 认证资料中的主部门摘要。 */
export type AuthDepartment = {
  /** 部门数据库主键。 */
  id: number;
  /** 稳定且全局唯一的部门代码。 */
  code: string;
  /** 部门中文名称。 */
  name: string;
  /** 部门当前是否可承载成员和业务数据。 */
  status: 'ACTIVE' | 'DISABLED';
};

/** 认证资料中的角色摘要。 */
export type AuthRole = {
  /** 角色数据库主键。 */
  id: number;
  /** 稳定且全局唯一的角色代码。 */
  code: string;
  /** 面向用户展示的中文角色名称。 */
  name: string;
  /** 是否为只能通过代码目录同步的系统角色。 */
  isSystem: boolean;
};

/** 登录会话与个人资料接口返回的认证用户。 */
export type AuthUser = {
  /** 用户数据库主键。 */
  id: number;
  /** 用户登录邮箱。 */
  email: string;
  /** 用户显示名称。 */
  name: string | null;
  /** 用户头像地址。 */
  avatarUrl: string | null;
  /** 用户账号状态。 */
  status: AuthUserStatus;
  /** 当前生效且前端可以识别的系统权限码。 */
  permissions: SystemPermissionCode[];
  /** 用户当前所属的主部门；`null` 表示尚未分配部门。 */
  department: AuthDepartment | null;
  /** 用户当前拥有的角色摘要。 */
  roles: AuthRole[];
  /** 是否拥有受保护的超级管理员角色。 */
  isSuperAdmin: boolean;
  /** 用户是否已完成部门和角色等基础授权配置。 */
  accessState: AuthAccessState;
  /** 邮箱验证时间；`null` 表示尚未验证。 */
  emailVerifiedAt: string | null;
  /** 最近登录时间；`null` 表示从未登录。 */
  lastLoginAt: string | null;
  /** 用户创建时间，使用 ISO 8601 字符串。 */
  createdAt: string;
  /** 用户最后更新时间，使用 ISO 8601 字符串。 */
  updatedAt: string;
};

/** 当前登录用户修改个人资料时提交的请求体。 */
export type UpdateProfileRequestPayload = {
  /** 修改后的用户显示名称。 */
  name: string;
};

/** 当前登录用户上传或移除头像后的返回结果。 */
export type UpdateAvatarResult = {
  /** 已更新头像地址的最新认证用户资料。 */
  user: AuthUser;
};

/** 一组可用于浏览器认证的访问令牌与刷新令牌。 */
export type AuthTokens = {
  /** HTTP Authorization 头使用的令牌类型。 */
  tokenType: 'Bearer';
  /** 短期访问令牌。 */
  accessToken: string;
  /** 访问令牌失效时间，使用 ISO 8601 字符串。 */
  accessTokenExpiresAt: string;
  /** 访问令牌剩余有效秒数。 */
  accessTokenExpiresIn: number;
  /** 仅可轮换一次的长期刷新令牌。 */
  refreshToken: string;
  /** 刷新令牌失效时间，使用 ISO 8601 字符串。 */
  refreshTokenExpiresAt: string;
  /** 刷新令牌剩余有效秒数。 */
  refreshTokenExpiresIn: number;
};

/** 登录或确认邮箱成功后返回的完整认证会话。 */
export type AuthSession = {
  /** 当前认证用户。 */
  user: AuthUser;
  /** 本次签发的认证令牌。 */
  tokens: AuthTokens;
};

/** 注册完成后的邮箱验证状态。 */
export type EmailVerificationState = {
  /** 当前账号是否仍需完成邮箱验证。 */
  required: boolean;
  /** 验证码发送到的脱敏邮箱。 */
  sentTo: string;
  /** 当前验证码失效时间；未发送时为 `null`。 */
  expiresAt: string | null;
  /** 再次发送验证码前需要等待的秒数。 */
  cooldownSeconds: number;
};

/** 用户注册成功后的业务结果。 */
export type RegisterResult = {
  /** 新注册的认证用户。 */
  user: AuthUser;
  /** 新用户当前的邮箱验证状态。 */
  emailVerification: EmailVerificationState;
};

/** 不包含令牌的安全会话摘要。 */
export type SanitizedAuthSession = {
  /** 当前认证用户。 */
  user: AuthUser;
};

/** 只需要表达操作是否完成的业务结果。 */
export type OperationResult = {
  /** 操作是否已经完成。 */
  success: boolean;
};

/** 登录接口响应。 */
export type LoginApiResponse = ApiResponse<AuthSession>;

/** 注册接口响应。 */
export type RegisterApiResponse = ApiResponse<RegisterResult>;

/** 发送邮箱验证码接口响应。 */
export type SendEmailVerificationApiResponse = ApiResponse<EmailVerificationState>;

/** 确认邮箱验证码接口响应。 */
export type ConfirmEmailApiResponse = ApiResponse<AuthSession>;

/** 获取临时密码公钥接口响应。 */
export type PasswordPublicKeyApiResponse = ApiResponse<PasswordPublicKey>;

/** 获取安全认证会话接口响应。 */
export type SanitizedAuthSessionApiResponse = ApiResponse<SanitizedAuthSession>;

/** 修改当前用户个人资料接口响应。 */
export type UpdateProfileApiResponse = ApiResponse<AuthUser>;

/** 上传或移除当前用户头像接口响应。 */
export type UpdateAvatarApiResponse = ApiResponse<UpdateAvatarResult>;
