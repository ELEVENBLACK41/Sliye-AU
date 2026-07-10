/**
 * 本文件封装 Server Component 与 Route Handler 使用的认证资料和权限校验能力。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SystemPermissionCode } from '@workspace/contracts/access';
import type { AuthUser } from '@workspace/contracts/auth';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import { requestProfileFromNest } from './auth-bff.service';

/**
 * 读取当前登录用户资料。
 *
 * React `cache` 只在一次服务端渲染内复用结果，权限不会写入 JWT，也不会跨请求缓存，
 * 因此管理员调整授权后，用户下一次请求即可读取到最新权限。
 */
export const getCurrentAuthUser = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE_NAME)?.value;

  if (!accessToken) {
    return null;
  }

  const response = await requestProfileFromNest(accessToken);

  if (!response.body.success) {
    return null;
  }

  return response.body.data;
});

/** 确认用户已经登录；会话不存在或失效时跳转登录页。 */
export async function requireAuthenticatedUser(): Promise<AuthUser> {
  const user = await getCurrentAuthUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

/** 确认用户已经完成部门和角色分配；待授权用户跳转到等待页。 */
export async function requireReadyUser(): Promise<AuthUser> {
  const user = await requireAuthenticatedUser();

  if (user.accessState !== 'READY') {
    redirect('/dashboard/pending-access');
  }

  return user;
}

/**
 * 校验服务端页面所需的细粒度权限码。
 *
 * 此校验负责页面体验，真实资源访问仍由 NestJS 全局守卫和业务数据范围共同拦截。
 */
export async function requireServerPermission(permission: SystemPermissionCode): Promise<AuthUser> {
  const user = await requireReadyUser();

  if (!hasSystemPermission(user, permission)) {
    redirect('/dashboard/forbidden');
  }

  return user;
}

/** 判断认证用户是否拥有指定系统权限，超级管理员始终返回允许。 */
export function hasSystemPermission(user: AuthUser, permission: SystemPermissionCode): boolean {
  return user.isSuperAdmin || user.permissions.includes(permission);
}
