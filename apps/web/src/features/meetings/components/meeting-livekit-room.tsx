/**
 * 本文件提供会议页的 LiveKit Cloud 音视频加入、连接、结束和错误反馈界面。
 */
'use client';

import { useState } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import type { MeetingLiveKitCredentials, MeetingParticipant } from '@workspace/contracts/meetings';
import { Loader2, UsersRound, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DisconnectReason } from 'livekit-client';

import { MeetingLiveKitConference } from './meeting-livekit-conference';
import { getMeetingLiveKitCredentials } from '../services/meetings-client.service';
import { ApiClientError } from '@/services/request';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/ui/components/alert-dialog';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 会议 LiveKit 音视频区域属性。 */
type MeetingLiveKitRoomProps = {
  /** 当前会议数据库主键。 */
  meetingId: number;
  /** 当前用户是否属于会议受邀成员。 */
  canJoin: boolean;
  /** 当前会议全部受邀成员及其历史进入、退出时间。 */
  participants: MeetingParticipant[];
};

/** 渲染按需申请权限并连接 LiveKit Cloud 的会议音视频区域。 */
export function MeetingLiveKitRoom({ meetingId, canJoin, participants }: MeetingLiveKitRoomProps) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<MeetingLiveKitCredentials | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [meetingEnded, setMeetingEnded] = useState(false);

  /** 在明确的用户操作后申请短期凭证并开始连接房间。 */
  async function handleJoin(): Promise<void> {
    setIsJoining(true);
    setErrorMessage('');

    try {
      setCredentials(await getMeetingLiveKitCredentials(meetingId));
    } catch (error) {
      setErrorMessage(
        error instanceof ApiClientError || error instanceof Error ? error.message : '加入音视频会议失败，请稍后重试',
      );
    } finally {
      setIsJoining(false);
    }
  }

  /** 离开房间时清理凭证；服务端删除房间时额外展示会议结束提示。 */
  function handleDisconnected(reason?: DisconnectReason): void {
    setCredentials(null);
    if (reason === DisconnectReason.ROOM_DELETED) {
      setMeetingEnded(true);
    }
  }

  /** 将 LiveKit 连接异常转换为当前页面可展示的中文反馈。 */
  function handleLiveKitError(): void {
    setErrorMessage('音视频连接失败，请检查网络后重试');
  }

  /** 在浏览器拒绝或无法使用媒体设备时展示稳定的中文提示。 */
  function handleMediaDeviceFailure(): void {
    setErrorMessage('无法使用麦克风或摄像头，请检查浏览器设备权限');
  }

  /** 断开当前连接并清理错误，让用户重新申请加入凭证。 */
  function handleRetry(): void {
    setErrorMessage('');
    setCredentials(null);
  }

  /** 确认会议结束提示并刷新为只读会议记录页面。 */
  function handleMeetingEndedAcknowledged(): void {
    setMeetingEnded(false);
    setCredentials(null);
    router.refresh();
  }

  return (
    <>
      {credentials ? (
        <section aria-label="实时音视频会议" className="overflow-hidden rounded-lg border bg-background">
          {errorMessage ? (
            <Alert variant="destructive" className="m-3 w-auto">
              <AlertTitle>音视频连接异常</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{errorMessage}</span>
                <Button type="button" size="sm" variant="outline" onClick={handleRetry}>
                  退出并重试
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          <div data-lk-theme="default" className="h-[min(68vh,46rem)] min-h-[28rem] bg-neutral-950">
            <LiveKitRoom
              serverUrl={credentials.serverUrl}
              token={credentials.participantToken}
              connect
              audio
              video
              onDisconnected={handleDisconnected}
              onError={handleLiveKitError}
              onMediaDeviceFailure={handleMediaDeviceFailure}
              className="h-full"
            >
              <MeetingLiveKitConference invitedParticipants={participants} />
            </LiveKitRoom>
          </div>
        </section>
      ) : (
        <Card className="rounded-md shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Video className="size-4" aria-hidden />
              实时音视频
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage ? (
              <Alert variant="destructive">
                <AlertTitle>暂时无法加入</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
              {canJoin ? (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border bg-muted/30 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">LiveKit Cloud 房间已就绪</p>
                    <p className="text-sm text-muted-foreground">点击加入后，浏览器会申请麦克风和摄像头权限。</p>
                  </div>
                  <Button onClick={handleJoin} disabled={isJoining}>
                    {isJoining ? <Loader2 className="animate-spin" aria-hidden /> : <Video aria-hidden />}
                    {isJoining ? '正在加入' : '加入音视频'}
                  </Button>
                </div>
              ) : (
                <Alert>
                  <AlertTitle>仅限受邀成员</AlertTitle>
                  <AlertDescription>你可以查看当前会议，但不能加入本场音视频房间。</AlertDescription>
                </Alert>
              )}

              <div className="rounded-md border p-3">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <UsersRound className="size-4" aria-hidden />
                  受邀成员（{participants.length}）
                </p>
                <ul className="grid max-h-48 gap-2 overflow-y-auto">
                  {participants.map((participant) => (
                    <li key={participant.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{participant.user.name || `用户 ${participant.user.id}`}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {participant.joinedAt === null ? '未进入' : '已退出'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={meetingEnded}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>当前会议已结束</AlertDialogTitle>
            <AlertDialogDescription>
              主持人已经结束会议，音视频房间已关闭。你可以继续查看本场会议记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleMeetingEndedAcknowledged}>查看会议记录</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
