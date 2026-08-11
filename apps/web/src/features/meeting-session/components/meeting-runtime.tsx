/**
 * 本文件在应用根布局维持新版会议会话、全局反馈和悬浮小窗。
 */
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { toast } from '@workspace/ui/components/sonner';
import { MeetingMiniWindow } from './meeting-mini-window';
import { meetingSessionController } from '../services/meeting-session-controller';

/** 根级会议运行时属性。 */
type MeetingRuntimeProps = {
  /** 服务端可识别的当前登录用户；未登录时为 `null`。 */
  currentUserId: number | null;
};

/** 配置跨标签账号隔离、展示全局反馈并挂载会议小窗。 */
export function MeetingRuntime({ currentUserId }: MeetingRuntimeProps) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    meetingSessionController.configureUser(currentUserId);
  }, [currentUserId]);

  useEffect(
    () =>
      meetingSessionController.subscribeFeedback((feedback) => {
        if (feedback.type === 'error') toast.error(feedback.message);
        else toast(feedback.message);
        if (feedback.type === 'ended' && /^\/meetings\/\d+\/room$/.test(pathname)) router.replace('/meetings');
      }),
    [pathname, router],
  );

  return <MeetingMiniWindow />;
}
