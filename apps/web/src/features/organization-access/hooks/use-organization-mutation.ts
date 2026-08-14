/**
 * 本文件统一管理新版组织与权限写操作的提交状态与中文反馈。
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiClientError } from '@/services/request';

/** 写操作反馈状态。 */
export type OrganizationMutationMessage = {
  /** 反馈类型。 */
  type: 'success' | 'error';
  /** 面向用户的中文反馈。 */
  text: string;
} | null;

/** 串行执行组织管理写操作并刷新服务端数据。 */
export function useOrganizationMutation() {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState('');
  const [message, setMessage] = useState<OrganizationMutationMessage>(null);

  /** 执行一次写操作，成功后刷新当前路由数据。 */
  async function runMutation(action: string, successText: string, callback: () => Promise<void>): Promise<boolean> {
    if (pendingAction) return false;
    setPendingAction(action);
    setMessage(null);
    try {
      await callback();
      setMessage({ type: 'success', text: successText });
      router.refresh();
      return true;
    } catch (error) {
      const requestId = error instanceof ApiClientError ? error.requestId : undefined;
      const base = error instanceof Error ? error.message : '操作失败，请稍后重试';
      setMessage({ type: 'error', text: requestId ? `${base}（请求编号：${requestId}）` : base });
      return false;
    } finally {
      setPendingAction('');
    }
  }

  return { pendingAction, message, setMessage, runMutation };
}
