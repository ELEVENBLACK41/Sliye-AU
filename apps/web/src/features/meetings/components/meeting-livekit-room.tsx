/**
 * 本文件提供会议页的 LiveKit Cloud 音视频加入、连接和错误反馈界面。
 */
'use client';

import { useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import type { MeetingLiveKitCredentials } from '@workspace/contracts/meetings';
import { Loader2, Video } from 'lucide-react';

import { getMeetingLiveKitCredentials } from '../services/meetings-client.service';
import { ApiClientError } from '@/services/request';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** 会议 LiveKit 音视频区域属性。 */
type MeetingLiveKitRoomProps = {
  /** 当前会议数据库主键。 */
  meetingId: number;
  /** 当前用户是否属于会议受邀成员。 */
  canJoin: boolean;
};

/** 渲染按需申请权限并连接 LiveKit Cloud 的会议音视频区域。 */
export function MeetingLiveKitRoom({ meetingId, canJoin }: MeetingLiveKitRoomProps) {
  const [credentials, setCredentials] = useState<MeetingLiveKitCredentials | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  /** 离开 LiveKit 房间后清理短期凭证，允许用户重新加入。 */
  function handleDisconnected(): void {
    setCredentials(null);
  }

  /** 将 LiveKit 连接或设备异常转换为当前页面可展示的中文反馈。 */
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

  if (credentials) {
    return (
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
            <VideoConference className="h-full" />
          </LiveKitRoom>
        </div>
      </section>
    );
  }

  return (
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
      </CardContent>
    </Card>
  );
}
