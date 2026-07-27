/**
 * 本文件统一把实时业务通知写入 Zustand，并使用 shadcn Sonner 在页面顶部展示。
 */
'use client';

import type { RealtimeNotification } from '@workspace/contracts/notifications';

import { useNotificationStore } from '../store/notification-store';
import { toast } from '@workspace/ui/components/sonner';

/** 全站业务通知默认保留一分钟。 */
export const NOTIFICATION_TOAST_DURATION_MS = 60_000;

/** 幂等写入全局 Store，并在首次收到时展示顶部 Sonner。 */
export function presentNotification(notification: RealtimeNotification): void {
  const received = useNotificationStore.getState().receive(notification);
  if (!received) {
    return;
  }

  toast(notification.title, {
    id: notification.id,
    description: notification.message,
    duration: NOTIFICATION_TOAST_DURATION_MS,
    position: 'top-center',
    action: notification.meeting
      ? {
          label: '查看会议',
          onClick: () => {
            window.location.assign(`/meetings/${notification.meeting!.id}`);
          },
        }
      : undefined,
  });
}
