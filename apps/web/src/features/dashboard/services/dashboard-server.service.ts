/**
 * 本文件负责新版工作台 Server Component 的鉴权 Cookie 读取与接口解包。
 */
import { cache } from 'react';
import { cookies } from 'next/headers';

import { AUTH_ACCESS_COOKIE_NAME } from '@/features/auth/constants';
import type { NestResponse } from '@/services/bff-request';
import { requestDashboardInsightsFromNest, requestDashboardSummaryFromNest } from './dashboard-nest-client';

/** 读取当前用户的工作台参与摘要。 */
export const getDashboardSummary = cache(async () =>
  unwrap(await requestDashboardSummaryFromNest(await getAccessToken())),
);

/** 读取工作台趋势、提案、项目与决策洞察。 */
export const getDashboardInsights = cache(async () =>
  unwrap(await requestDashboardInsightsFromNest(await getAccessToken())),
);

/** 从 httpOnly Cookie 读取访问令牌。 */
async function getAccessToken(): Promise<string> {
  const accessToken = (await cookies()).get(AUTH_ACCESS_COOKIE_NAME)?.value;
  if (!accessToken) throw new Error('登录状态已失效，请重新登录');
  return accessToken;
}

/** 解包 NestJS 统一响应。 */
function unwrap<T>(response: NestResponse<T>): T {
  if (!response.body.success) throw new Error(response.body.message);
  return response.body.data;
}
