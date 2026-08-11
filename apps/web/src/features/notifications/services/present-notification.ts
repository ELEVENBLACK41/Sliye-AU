/**
 * 本文件统一把实时业务通知写入 Zustand，并使用 shadcn Sonner 在页面顶部展示。
 */
'use client';

import type { RealtimeNotification } from '@workspace/contracts/notifications';

import { useNotificationStore } from '../store/notification-store';
import { toast } from '@workspace/ui/components/sonner';

/** 普通全站业务通知默认展示三秒。 */
export const DEFAULT_NOTIFICATION_TOAST_DURATION_MS = 3_000;

/** 会议邀请需要给用户留出响应时间，因此展示一分钟。 */
export const MEETING_INVITATION_TOAST_DURATION_MS = 60_000;

/** 单次通知展示时允许覆盖的配置。 */
interface PresentNotificationOptions {
  /** 覆盖该通知的 Sonner 展示时长，单位为毫秒。 */
  duration?: number;
}

/** 根据通知类型返回对应的 Sonner 展示时长。 */
function resolveNotificationToastDuration(type: RealtimeNotification['type']): number {
  return type === 'MEETING_INVITED' ? MEETING_INVITATION_TOAST_DURATION_MS : DEFAULT_NOTIFICATION_TOAST_DURATION_MS;
}

/** 幂等写入全局 Store，并在首次收到时展示顶部 Sonner。 */
export function presentNotification(notification: RealtimeNotification, options?: PresentNotificationOptions): void {
  const received = useNotificationStore.getState().receive(notification);
  if (!received) {
    return;
  }

  if (notification.type === 'MEETING_INCOMING_CALL') {
    return;
  }

  // LiveKit ROOM_DELETED 是主要退出信号；会议结束通知作为断线原因丢失时的页面级兜底。
  if (
    notification.type === 'MEETING_ENDED' &&
    notification.meeting &&
    window.location.pathname === `/meetings/${notification.meeting.id}/room`
  ) {
    toast(notification.title, { description: notification.message, position: 'top-center' });
    window.location.replace('/meetings');
    return;
  }

  toast(notification.title, {
    id: notification.id,
    description: notification.message,
    duration: options?.duration ?? resolveNotificationToastDuration(notification.type),
    position: 'top-center',
    // 接听/拒绝只是房内状态反馈，主持人已在会议上下文中，不再重复提供“查看会议”。
    action:
      notification.meeting && notification.type !== 'MEETING_CALL_RESPONSE'
        ? {
            label: notification.type === 'MEETING_ENDED' ? '查看会议详情' : '查看会议',
            onClick: () => {
              window.location.assign(
                notification.type === 'MEETING_ENDED'
                  ? `/meetings?view=records&meetingId=${notification.meeting!.id}`
                  : `/meetings/${notification.meeting!.id}`,
              );
            },
          }
        : undefined,
  });
}
