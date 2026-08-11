/**
 * 本文件提供新版会议全屏房间和悬浮小窗复用的媒体控制与退出操作。
 */
'use client';

import { useState } from 'react';
import { LoaderCircle, Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from 'lucide-react';

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
import { useMeetingSession } from '../hooks/use-meeting-session';

/** 会议控制栏属性。 */
type MeetingSessionControlBarProps = {
  /** 紧凑模式只展示图标，用于悬浮小窗。 */
  compact?: boolean;
  /** 普通参与者成功离开后通知全屏页面跳转。 */
  onLeave?: () => void;
};

/** 渲染媒体开关以及带权限语义的离开或结束操作。 */
export function MeetingSessionControlBar({ compact = false, onLeave }: MeetingSessionControlBarProps) {
  const {
    status,
    microphoneEnabled,
    cameraEnabled,
    screenShareEnabled,
    canEndMeeting,
    controller,
  } = useMeetingSession();
  const [leaving, setLeaving] = useState(false);
  const controlsDisabled = status !== 'CONNECTED' && status !== 'RECONNECTING';

  /** 普通参与者离开会议，主持人的结束动作由确认弹窗处理。 */
  async function handleLeave(): Promise<void> {
    setLeaving(true);
    try {
      await controller.leave();
      onLeave?.();
    } finally {
      setLeaving(false);
    }
  }

  /** 主持人确认后结束整场会议。 */
  async function handleEnd(): Promise<void> {
    setLeaving(true);
    try {
      await controller.end();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <div
      className={
        compact
          ? 'flex items-center justify-center gap-1.5'
          : 'mx-auto mt-4 flex max-w-full items-center gap-2 overflow-x-auto rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-control p-3 shadow-2xl sm:gap-3 sm:px-5'
      }
      aria-label="会议媒体控制"
    >
      <MediaControlButton
        label="麦克风"
        active={microphoneEnabled}
        activeIcon={Mic}
        inactiveIcon={MicOff}
        compact={compact}
        disabled={controlsDisabled}
        onClick={() => void controller.toggleMicrophone()}
      />
      <MediaControlButton
        label="摄像头"
        active={cameraEnabled}
        activeIcon={Video}
        inactiveIcon={VideoOff}
        compact={compact}
        disabled={controlsDisabled}
        onClick={() => void controller.toggleCamera()}
      />
      {!compact ? (
        <MediaControlButton
          label="共享屏幕"
          active={screenShareEnabled}
          activeIcon={MonitorUp}
          inactiveIcon={MonitorUp}
          disabled={controlsDisabled}
          onClick={() => void controller.toggleScreenShare()}
        />
      ) : null}
      <span className={compact ? 'h-7 border-l border-meeting-room-foreground/10' : 'mx-1 h-9 border-l border-meeting-room-foreground/10'} aria-hidden />
      {canEndMeeting ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size={compact ? 'icon' : 'default'}
              disabled={leaving}
              aria-label="结束会议"
              className={
                compact
                  ? 'rounded-xl bg-meeting-room-danger text-meeting-room-foreground hover:bg-meeting-room-danger/85'
                  : 'flex h-14 min-w-20 flex-col gap-1 rounded-2xl bg-meeting-room-danger text-meeting-room-foreground hover:bg-meeting-room-danger/85'
              }
            >
              {leaving ? <LoaderCircle aria-hidden className="animate-spin" /> : <PhoneOff aria-hidden />}
              {!compact ? <span className="text-[0.7rem]">结束会议</span> : null}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认结束整场会议？</AlertDialogTitle>
              <AlertDialogDescription>结束后所有参与者都会退出音视频房间，此操作不会只影响当前标签页。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={() => void handleEnd()}>
                确认结束
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'icon' : 'default'}
          disabled={leaving}
          onClick={() => void handleLeave()}
          aria-label="离开会议"
          className={
            compact
              ? 'rounded-xl bg-meeting-room-danger text-meeting-room-foreground hover:bg-meeting-room-danger/85'
              : 'flex h-14 min-w-20 flex-col gap-1 rounded-2xl bg-meeting-room-danger text-meeting-room-foreground hover:bg-meeting-room-danger/85'
          }
        >
          {leaving ? <LoaderCircle aria-hidden className="animate-spin" /> : <PhoneOff aria-hidden />}
          {!compact ? <span className="text-[0.7rem]">离开会议</span> : null}
        </Button>
      )}
    </div>
  );
}

/** 单个媒体控制按钮属性。 */
type MediaControlButtonProps = {
  /** 控制名称。 */
  label: string;
  /** 当前是否开启。 */
  active: boolean;
  /** 开启状态图标。 */
  activeIcon: typeof Mic;
  /** 关闭状态图标。 */
  inactiveIcon: typeof Mic;
  /** 是否使用紧凑图标按钮。 */
  compact?: boolean;
  /** 是否禁止当前操作。 */
  disabled?: boolean;
  /** 点击操作。 */
  onClick: () => void;
};

/** 渲染带无障碍状态的媒体控制按钮。 */
function MediaControlButton({
  label,
  active,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
  compact = false,
  disabled = false,
  onClick,
}: MediaControlButtonProps) {
  const Icon = active ? ActiveIcon : InactiveIcon;
  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? 'icon' : 'default'}
      aria-label={active ? label : `${label}已关闭`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${compact ? 'rounded-xl' : 'flex h-14 min-w-16 flex-col gap-1 rounded-2xl'} text-meeting-room-foreground hover:bg-meeting-room-foreground/10 ${
        active ? '' : 'bg-meeting-room-foreground/10'
      }`}
    >
      <Icon aria-hidden />
      {!compact ? <span className="text-[0.7rem]">{active ? label : `${label}已关`}</span> : null}
    </Button>
  );
}
