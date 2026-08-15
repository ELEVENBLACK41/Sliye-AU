/**
 * 本文件实现会议房间底部的前端设备控制和移动端参会信息面板。
 */
'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ListChecks,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  PhoneOff,
  UsersRound,
  Video,
  VideoOff,
} from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@workspace/ui/components/sheet';

import { MeetingDecisionCollaborationPanel } from './meeting-decision-collaboration-panel';
import { MeetingRoomSidebar } from './meeting-room-sidebar';

/** 渲染可本地切换麦克风与摄像头状态的会议控制栏。 */
export function MeetingRoomControlBar() {
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);

  /** 切换前端预览中的麦克风按钮状态。 */
  function handleMicrophoneToggle(): void {
    setIsMicrophoneEnabled((currentValue) => !currentValue);
  }

  /** 切换前端预览中的摄像头按钮状态。 */
  function handleCameraToggle(): void {
    setIsCameraEnabled((currentValue) => !currentValue);
  }

  return (
    <div className="mx-auto mt-4 flex max-w-full items-center gap-2 overflow-x-auto rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-control p-3 shadow-2xl sm:gap-3 sm:px-5">
      <ControlButton
        label="麦克风"
        active={isMicrophoneEnabled}
        activeIcon={Mic}
        inactiveIcon={MicOff}
        onClick={handleMicrophoneToggle}
      />
      <ControlButton
        label="摄像头"
        active={isCameraEnabled}
        activeIcon={Video}
        inactiveIcon={VideoOff}
        onClick={handleCameraToggle}
        emphasis
      />
      <ControlButton label="共享屏幕" active activeIcon={MonitorUp} inactiveIcon={MonitorUp} disabled />

      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-14 min-w-16 flex-col gap-1 rounded-2xl text-meeting-room-foreground hover:bg-meeting-room-foreground/10"
          >
            <UsersRound aria-hidden />
            <span className="text-[0.7rem]">参与人</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full bg-meeting-room-sidebar p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>会议参与人</SheetTitle>
          </SheetHeader>
          <MeetingRoomSidebar />
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="flex h-14 min-w-16 flex-col gap-1 rounded-2xl text-meeting-room-foreground hover:bg-meeting-room-foreground/10 lg:hidden"
          >
            <ListChecks aria-hidden />
            <span className="text-[0.7rem]">决策协作</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full bg-meeting-room-sidebar p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>决策协作</SheetTitle>
          </SheetHeader>
          <MeetingDecisionCollaborationPanel />
        </SheetContent>
      </Sheet>

      <ControlButton label="更多" active activeIcon={MoreHorizontal} inactiveIcon={MoreHorizontal} disabled />

      <span className="mx-1 h-9 border-l border-meeting-room-foreground/10" aria-hidden />

      <Button
        asChild
        variant="ghost"
        className="flex h-14 min-w-16 flex-col gap-1 rounded-2xl bg-meeting-room-danger text-meeting-room-foreground hover:bg-meeting-room-danger/85"
      >
        <Link href="/meetings">
          <PhoneOff aria-hidden />
          <span className="text-[0.7rem]">结束通话</span>
        </Link>
      </Button>
    </div>
  );
}

/** 单个会议设备控制按钮的属性。 */
type ControlButtonProps = {
  /** 控制项名称。 */
  label: string;
  /** 当前设备是否开启。 */
  active: boolean;
  /** 设备开启时显示的图标。 */
  activeIcon: typeof Mic;
  /** 设备关闭时显示的图标。 */
  inactiveIcon: typeof Mic;
  /** 点击按钮时执行的状态切换。 */
  onClick?: () => void;
  /** 是否使用会议强调色。 */
  emphasis?: boolean;
  /** 是否禁用尚未接入的操作。 */
  disabled?: boolean;
  /** 额外的响应式样式。 */
  className?: string;
};

/** 渲染一个带中文状态提示的设备控制按钮。 */
function ControlButton({
  label,
  active,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
  onClick,
  emphasis = false,
  disabled = false,
  className = '',
}: ControlButtonProps) {
  const Icon = active ? ActiveIcon : InactiveIcon;

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      aria-pressed={disabled ? undefined : active}
      onClick={onClick}
      className={`flex h-14 min-w-16 flex-col gap-1 rounded-2xl text-meeting-room-foreground hover:bg-meeting-room-foreground/10 ${
        emphasis && active ? 'bg-meeting-accent text-meeting-accent-foreground hover:bg-meeting-accent/85' : ''
      } ${!active ? 'bg-meeting-room-foreground/10' : ''} ${className}`}
    >
      <Icon aria-hidden />
      <span className="text-[0.7rem]">{active ? label : `${label}已关`}</span>
    </Button>
  );
}
