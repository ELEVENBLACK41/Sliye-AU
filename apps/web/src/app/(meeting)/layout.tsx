/**
 * 本文件为独立会议路由提供登录校验，不复用 dashboard 侧边栏。
 */
import type { ReactNode } from 'react';

import { requireAuthenticatedUser } from '@/features/auth/services/auth-server.service';

import '@livekit/components-styles';

/** 校验会议路由登录态并渲染全屏内容。 */
export default async function MeetingLayout({ children }: { children: ReactNode }) {
  await requireAuthenticatedUser();

  return children;
}
