/**
 * 本文件封装权限管理写操作的提交状态、统一反馈和服务端数据刷新逻辑。
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiClientError } from '@/services/request';

/** 页面操作完成后的反馈消息。 */
export type AccessActionMessage = {
  /** 消息展示样式。 */
  type: 'success' | 'error';
  /** 面向用户展示的中文内容。 */
  text: string;
} | null;

/** 管理异步写操作的加载状态、统一错误提示和页面数据刷新。 */
export function useAccessAction() {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState('');
  const [message, setMessage] = useState<AccessActionMessage>(null);

  /** 串行执行一次写操作，并在成功后刷新 Server Component 数据。 */
  async function runAction(action: string, successMessage: string, callback: () => Promise<void>) {
    if (pendingAction) {
      return;
    }

    setPendingAction(action);
    setMessage(null);

    try {
      await callback();
      setMessage({ type: 'success', text: successMessage });
      router.refresh();
    } catch (error) {
      const requestId = error instanceof ApiClientError ? error.requestId : undefined;
      const baseMessage = error instanceof Error ? error.message : '操作失败，请稍后再试';
      setMessage({
        type: 'error',
        text: requestId ? `${baseMessage}（请求编号：${requestId}）` : baseMessage,
      });
    } finally {
      setPendingAction('');
    }
  }

  return { pendingAction, message, runAction };
}
