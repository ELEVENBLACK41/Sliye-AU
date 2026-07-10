/*
 * @Description: 认证、会话与请求级授权上下文的后端内部类型。
 */
import type { Request } from 'express';
import type { AuthUser } from '@workspace/contracts/auth';
import type { SystemPermissionCode } from '@workspace/contracts/access';
import type { DataScope, PermissionEffect } from '../../../generated/prisma';

export type {
  AuthSession as AuthSessionResponse,
  AuthTokens as AuthTokensResponse,
  AuthUser as AuthUserResponse,
  EmailVerificationState,
  OperationResult,
  RegisterResult as RegisterResponse,
} from '@workspace/contracts/auth';

/** 客户端随请求提供、可用于审计的基础信息。 */
export interface RequestClientMeta {
  /** 客户端 IP 地址。 */
  ipAddress?: string;
  /** 客户端 User-Agent。 */
  userAgent?: string;
  /** 贯穿 BFF 与 Nest 的请求追踪标识。 */
  requestId?: string;
}

/** Access Token 中保存的最小身份载荷。 */
export interface AccessTokenPayload {
  /** 用户主键。 */
  sub: number;
  /** 用户登录邮箱。 */
  email: string;
  /** 服务端会话主键。 */
  sid: string;
  /** 令牌类型，防止 refresh token 被误用。 */
  type: 'access';
  /** 签发时间戳，单位为秒。 */
  iat: number;
  /** 过期时间戳，单位为秒。 */
  exp: number;
  /** 当前令牌唯一标识。 */
  jti: string;
}

/** 认证守卫写入请求对象的最小身份上下文。 */
export interface AuthRequestContext {
  /** 当前用户主键。 */
  userId: number;
  /** 当前用户邮箱。 */
  email: string;
  /** 当前登录会话主键。 */
  sessionId: string;
  /** 当前 access token 唯一标识。 */
  tokenId: string;
}

/** 授权计算所需的角色权限记录。 */
export interface AuthorizationRoleGrantRecord {
  /** 权限码。 */
  code: string;
  /** 当前角色授予该权限的数据范围。 */
  scopeType: DataScope;
}

/** 授权计算所需的用户直接权限记录。 */
export interface AuthorizationDirectGrantRecord {
  /** 权限码。 */
  code: string;
  /** 授权或全局拒绝效果。 */
  effect: PermissionEffect;
  /** 当前直接授权的数据范围。 */
  scopeType: DataScope;
  /** 临时授权过期时间，为空表示长期有效。 */
  expiresAt: Date | null;
}

/** 从数据库读取后用于生成请求级授权上下文的用户记录。 */
export interface AuthorizationUserRecord {
  /** 用户主键。 */
  id: number;
  /** 用户所属主部门，为空表示尚未分配。 */
  deptId: number | null;
  /** 用户拥有的稳定角色代码。 */
  roleCodes: string[];
  /** 通过角色获得的权限范围。 */
  roleGrants: AuthorizationRoleGrantRecord[];
  /** 用户级直接授权与拒绝。 */
  directGrants: AuthorizationDirectGrantRecord[];
}

/** 单个权限码在当前请求中最终拥有的数据范围集合。 */
export interface EffectivePermissionGrant {
  /** 系统或遗留权限码。 */
  code: string;
  /** 合并角色与用户直接授权后的数据范围集合。 */
  scopes: ReadonlySet<DataScope>;
}

/** 每次请求实时计算出的授权上下文。 */
export interface AuthorizationContext {
  /** 当前用户主键。 */
  userId: number;
  /** 当前用户所属主部门。 */
  deptId: number | null;
  /** 当前用户是否拥有受保护的超级管理员角色。 */
  isSuperAdmin: boolean;
  /** 当前用户拥有的角色代码。 */
  roleCodes: ReadonlySet<string>;
  /** 已被用户级 DENY 全局拒绝的权限码。 */
  deniedPermissions: ReadonlySet<string>;
  /** 权限码到有效数据范围的映射。 */
  grants: ReadonlyMap<string, ReadonlySet<DataScope>>;
}

/** Nest HTTP 请求扩展，集中承载认证、授权和追踪上下文。 */
export interface AuthenticatedRequest extends Request {
  /** 认证守卫解析出的令牌身份。 */
  auth?: AuthRequestContext;
  /** 当前用户对外认证资料。 */
  user?: AuthUser;
  /** 请求级实时授权结果。 */
  authorization?: AuthorizationContext;
  /** 统一请求追踪标识。 */
  requestId?: string;
}

/** 编译期约束系统权限码的便捷只读集合类型。 */
export type SystemPermissionSet = ReadonlySet<SystemPermissionCode>;
