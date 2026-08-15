/**
 * 本文件封装浏览器端退出登录流程，供不同形态的退出入口复用。
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { OperationResult } from '@/features/auth/types/auth.type';
import { AUTH_SESSION_CHANGED_EVENT } from '@/features/notifications/constants';
import { requestData } from '@/services/request';
import { toast } from '@workspace/ui/components/sonner';

/** 调用退出接口、广播会话变化，并在成功后返回登录页。 */
export function useLogout() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  /** 防止重复提交，并保证接口失败时保留当前页面供用户重试。 */
  async function logout(): Promise<void> {
    if (isPending) return;

    setIsPending(true);

    try {
      await requestData<OperationResult>('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        errorMessage: '退出登录失败，请稍后再试',
      });
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
      router.replace('/login');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '退出登录失败，请稍后再试');
    } finally {
      setIsPending(false);
    }
  }

  return { isPending, logout };
}
