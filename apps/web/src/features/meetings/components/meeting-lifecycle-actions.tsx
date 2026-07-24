/**
 * 本文件实现会议房间的开始与结束操作。
 */
'use client';

import { useState } from 'react';
import { Loader2, LogOut, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { MeetingStatus } from '@workspace/contracts/meetings';

import { endMeeting, startMeeting } from '../services/meetings-client.service';
import { ApiClientError } from '@/services/request';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@workspace/ui/components/alert-dialog';
import { Button } from '@workspace/ui/components/button';

/** 会议生命周期操作属性。 */
type MeetingLifecycleActionsProps = {
  /** 当前会议主键。 */
  meetingId: number;
  /** 当前会议状态。 */
  status: MeetingStatus;
  /** 当前用户是否为会议管理者。 */
  canManage: boolean;
};

/** 根据会议状态展示开始或结束入口。 */
export function MeetingLifecycleActions({ meetingId, status, canManage }: MeetingLifecycleActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  /** 开始计划中的会议并刷新房间。 */
  async function handleStart(): Promise<void> {
    await runLifecycleAction(() => startMeeting(meetingId));
  }

  /** 结束进行中的会议并刷新只读房间。 */
  async function handleEnd(): Promise<void> {
    await runLifecycleAction(() => endMeeting(meetingId));
  }

  /** 统一执行生命周期请求和错误反馈。 */
  async function runLifecycleAction(action: () => Promise<unknown>): Promise<void> {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await action();
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError || error instanceof Error ? error.message : '会议操作失败，请稍后重试',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canManage || (status !== 'SCHEDULED' && status !== 'LIVE')) {
    return null;
  }

  return (
    <div className="grid justify-items-end gap-2">
      {errorMessage ? (
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {status === 'SCHEDULED' ? (
        <Button onClick={handleStart} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          开始会议
        </Button>
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isSubmitting}>
              <LogOut aria-hidden />
              结束会议
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认结束这场会议？</AlertDialogTitle>
              <AlertDialogDescription>结束后房间转为只读，本场会议不能再次开始。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>继续开会</AlertDialogCancel>
              <AlertDialogAction onClick={handleEnd}>确认结束</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
