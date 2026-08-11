/**
 * 本文件提供固定在页面右下角的全站 Sonner 测试按钮，便于观察通知入场动画性能。
 */
'use client';

import { BellRing } from 'lucide-react';

import { DEFAULT_NOTIFICATION_TOAST_DURATION_MS, presentNotification } from '../services/present-notification';
import { Button } from '@workspace/ui/components/button';

/** 通过真实通知 Store 与展示服务触发一条不会被去重的测试通知。 */
export function NotificationTestButton() {
  /** 构造唯一测试事件并走完整的全局通知展示链路。 */
  function handleTestNotification(): void {
    presentNotification(
      {
        id: `notification-test:${Date.now()}`,
        type: 'MEETING_INVITED',
        title: '会议邀请通知测试',
        message: '这是一条用于观察会议邀请 Sonner 入场动画和页面帧率的测试通知。',
        occurredAt: new Date().toISOString(),
      },
      { duration: DEFAULT_NOTIFICATION_TOAST_DURATION_MS },
    );
  }

  return (
    <Button type="button" className="fixed right-4 bottom-4 z-50 shadow-lg" onClick={handleTestNotification}>
      <BellRing aria-hidden />
      测试会议邀请
    </Button>
  );
}
