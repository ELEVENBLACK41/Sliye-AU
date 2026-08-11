/**
 * 本文件使用原生 livekit-client 驱动新版自研会议室，不依赖 LiveKit 预制 UI。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  LoaderCircle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  UserRound,
  UsersRound,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import type { MeetingDetail } from '@workspace/contracts/meetings';
import {
  ConnectionState,
  DisconnectReason,
  LocalParticipant,
  MediaDeviceFailure,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';

import { Button } from '@workspace/ui/components/button';
import { toast } from '@workspace/ui/components/sonner';
import { MeetingDecisionCollaborationPanel } from './meeting-decision-collaboration-panel';
import { endMeetingRoom, getMeetingRoomCredentials } from '../services/meeting-room-client.service';

/** 自研会议室页面属性。 */
type MeetingRoomLivePageProps = {
  /** 服务端校验后的会议详情。 */
  meeting: MeetingDetail;
  /** 当前登录用户主键。 */
  currentUserId: number;
};

/** 单个媒体轨道挂载属性。 */
type TrackAttachmentProps = {
  /** LiveKit 原生媒体轨道。 */
  track: Track;
  /** 本地视频需要静音，避免声音回授。 */
  muted?: boolean;
  /** 视频元素填充舞台所需样式。 */
  className?: string;
};

/** 把浏览器媒体设备异常转换成用户可执行的中文提示。 */
function resolveMediaDeviceMessage(error: unknown, kind?: MediaDeviceKind): string {
  const deviceName = kind === 'videoinput' ? '摄像头' : kind === 'audioinput' ? '麦克风' : '媒体设备';
  const failure = MediaDeviceFailure.getFailure(error);

  if (failure === MediaDeviceFailure.NotFound) return `未检测到可用${deviceName}，你仍可继续参会`;
  if (failure === MediaDeviceFailure.PermissionDenied) return `${deviceName}权限被拒绝，请在浏览器设置中允许访问`;
  if (failure === MediaDeviceFailure.DeviceInUse) return `${deviceName}正被其他应用占用，请关闭占用后重试`;
  return `${deviceName}暂时不可用，你仍可继续参会`;
}

/** 在请求采集前确认电脑上至少存在一项对应输入设备，避免无设备时触发无意义的 SDK 异常。 */
async function hasInputDevice(kind: 'audioinput' | 'videoinput'): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === kind);
  } catch {
    // 枚举受权限策略限制时仍交给 getUserMedia 返回更准确的权限错误。
    return true;
  }
}

/** 将 LiveKit 原生轨道附着到浏览器媒体元素并在卸载时释放。 */
function TrackAttachment({ track, muted = false, className }: TrackAttachmentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = track.attach();
    element.autoplay = true;
    element.className = className ?? '';
    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
      element.muted = muted;
    }
    containerRef.current?.appendChild(element);
    return () => {
      track.detach(element);
      element.remove();
    };
  }, [className, muted, track]);

  return <div ref={containerRef} className={track.kind === Track.Kind.Audio ? 'hidden' : 'absolute inset-0'} />;
}

/** 渲染连接 LiveKit 后的全屏自研会议房间。 */
export function MeetingRoomLivePage({ meeting, currentUserId }: MeetingRoomLivePageProps) {
  const router = useRouter();
  const roomRef = useRef<Room | null>(null);
  const leavingRef = useRef(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const currentRole = meeting.participants.find((item) => item.user.id === currentUserId)?.role;
  const canEndMeeting = currentRole === 'HOST' || currentRole === 'CO_HOST';

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    leavingRef.current = false;
    roomRef.current = room;

    /** 触发参与人和轨道列表重新渲染。 */
    function refreshRoomState(): void {
      setParticipants([room.localParticipant, ...room.remoteParticipants.values()]);
    }

    /** 在房内显示成员进入提示；服务端历史仍以 webhook 为准。 */
    function handleParticipantConnected(participant: RemoteParticipant): void {
      toast(`${participant.name || '一位成员'}已进入会议`);
      refreshRoomState();
    }

    /** 在房内显示成员退出提示，不广播全站通知。 */
    function handleParticipantDisconnected(participant: RemoteParticipant): void {
      toast(`${participant.name || '一位成员'}已离开会议`);
      refreshRoomState();
    }

    /** 主持人删除房间时让全部参与端自动离开页面，其他意外断线则留在当前页提示重试。 */
    function handleDisconnected(reason?: DisconnectReason): void {
      setConnectionState(ConnectionState.Disconnected);
      if (leavingRef.current) return;
      if (reason === DisconnectReason.ROOM_DELETED) {
        toast('主持人已结束会议');
        router.replace('/meetings');
        return;
      }
      setConnectionError('会议连接已断开，请检查网络后重新连接');
    }

    /** 记录 LiveKit 采集设备异常，但不把已经成功的房间连接判定为失败。 */
    function handleMediaDevicesError(error: Error, kind?: MediaDeviceKind): void {
      setDeviceWarning(resolveMediaDeviceMessage(error, kind));
    }

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.TrackSubscribed, refreshRoomState);
    room.on(RoomEvent.TrackUnsubscribed, refreshRoomState);
    room.on(RoomEvent.LocalTrackPublished, refreshRoomState);
    room.on(RoomEvent.LocalTrackUnpublished, refreshRoomState);
    room.on(RoomEvent.ConnectionStateChanged, setConnectionState);
    room.on(RoomEvent.Connected, refreshRoomState);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.MediaDevicesError, handleMediaDevicesError);

    /** 获取短期凭证、连接房间并按会议模式开启本地设备。 */
    async function connect(): Promise<void> {
      try {
        const credentials = await getMeetingRoomCredentials(meeting.id);
        await room.connect(credentials.serverUrl, credentials.participantToken);
        // 连接成功后立即渲染本地与远端成员；设备缺失不能让在线人数回退为 0。
        setConnectionError(null);
        refreshRoomState();

        if (await hasInputDevice('audioinput')) {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            setMicrophoneEnabled(true);
          } catch (error) {
            setDeviceWarning(resolveMediaDeviceMessage(error, 'audioinput'));
          }
        } else {
          setDeviceWarning('未检测到可用麦克风，你仍可继续参会');
        }
        if (meeting.mediaMode === 'VIDEO' && (await hasInputDevice('videoinput'))) {
          try {
            await room.localParticipant.setCameraEnabled(true);
            setCameraEnabled(true);
          } catch (error) {
            setDeviceWarning(resolveMediaDeviceMessage(error, 'videoinput'));
          }
        } else if (meeting.mediaMode === 'VIDEO') {
          setDeviceWarning('未检测到可用摄像头，你仍可继续参会');
        }
        try {
          await room.startAudio();
        } catch {
          setAudioBlocked(true);
        }
        refreshRoomState();
      } catch (error) {
        const message = error instanceof Error ? error.message : '会议连接失败';
        setConnectionError(message);
        toast.error(message);
      }
    }

    void connect();
    return () => {
      leavingRef.current = true;
      room.removeAllListeners();
      if (room.state !== ConnectionState.Disconnected) void room.disconnect();
      roomRef.current = null;
    };
  }, [meeting.id, meeting.mediaMode, router]);

  /** 切换当前用户麦克风并同步按钮状态。 */
  async function toggleMicrophone(): Promise<void> {
    const next = !microphoneEnabled;
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
      setMicrophoneEnabled(next);
    } catch (error) {
      const message = resolveMediaDeviceMessage(error, 'audioinput');
      setDeviceWarning(message);
      toast.error(message);
    }
  }

  /** 切换当前用户摄像头并同步按钮状态。 */
  async function toggleCamera(): Promise<void> {
    const next = !cameraEnabled;
    try {
      await roomRef.current?.localParticipant.setCameraEnabled(next);
      setCameraEnabled(next);
    } catch (error) {
      const message = resolveMediaDeviceMessage(error, 'videoinput');
      setDeviceWarning(message);
      toast.error(message);
    }
  }

  /** 切换屏幕共享轨道。 */
  async function toggleScreenShare(): Promise<void> {
    const next = !screenShareEnabled;
    try {
      await roomRef.current?.localParticipant.setScreenShareEnabled(next);
      setScreenShareEnabled(next);
    } catch {
      toast.error('屏幕共享未能启动');
    }
  }

  /** 普通参与人仅离开房间，主持人明确选择时结束整场会议。 */
  async function handleLeave(): Promise<void> {
    leavingRef.current = true;
    if (canEndMeeting) {
      setEnding(true);
      try {
        await endMeetingRoom(meeting.id);
      } catch (error) {
        leavingRef.current = false;
        toast.error(error instanceof Error ? error.message : '结束会议失败');
        setEnding(false);
        return;
      }
    }
    if (roomRef.current?.state !== ConnectionState.Disconnected) {
      await roomRef.current?.disconnect();
    }
    router.replace('/meetings');
  }

  /** 用户手势恢复被浏览器自动播放策略阻止的远端音频。 */
  async function resumeAudio(): Promise<void> {
    try {
      await roomRef.current?.startAudio();
      setAudioBlocked(false);
    } catch {
      toast.error('浏览器仍未允许播放会议声音');
    }
  }

  const connectionLabel =
    connectionState === ConnectionState.Connected
      ? '已连接'
      : connectionState === ConnectionState.Reconnecting
        ? '正在重连'
        : '正在连接';

  return (
    <main className="min-h-dvh bg-meeting-room-background text-meeting-room-foreground lg:grid lg:h-dvh lg:min-h-[42rem] lg:grid-cols-[minmax(0,1fr)_24rem] lg:overflow-hidden">
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="会议画面与控制区">
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-start gap-4 px-5 py-5 sm:px-8">
          <Button asChild variant="ghost" className="w-fit rounded-full text-meeting-room-foreground/70">
            <Link href="/meetings">
              <ArrowLeft aria-hidden />
              <span className="hidden sm:inline">返回会议中心</span>
            </Link>
          </Button>
          <div className="min-w-0 text-center">
            <h1 className="truncate text-lg font-semibold sm:text-2xl">{meeting.title}</h1>
            <p className="mt-2 text-xs text-meeting-room-foreground/55 sm:text-sm">
              {connectionLabel} · {meeting.projectId ? meeting.areaName : '独立会议'} · {participants.length} 人在线
            </p>
          </div>
          <span aria-hidden />
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-7 sm:pb-6">
          {audioBlocked ? (
            <Button onClick={() => void resumeAudio()} className="mb-3 self-center rounded-full">
              <Volume2 aria-hidden />
              点击恢复会议声音
            </Button>
          ) : null}
          {deviceWarning ? (
            <p className="mb-3 rounded-2xl border border-meeting-room-foreground/10 bg-meeting-room-control px-4 py-2 text-center text-sm text-meeting-room-foreground/70">
              {deviceWarning}
            </p>
          ) : null}
          <div className="grid min-h-0 flex-1 auto-rows-fr gap-3 sm:grid-cols-2" aria-label="会议视频画面">
            {connectionError ? (
              <div className="col-span-full grid place-items-center rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-video px-6 text-center">
                <div>
                  <p className="font-medium">暂时无法进入会议</p>
                  <p className="mt-2 text-sm text-meeting-room-foreground/55">{connectionError}</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="mt-4 rounded-xl"
                  >
                    重新连接
                  </Button>
                </div>
              </div>
            ) : participants.length === 0 ? (
              <div className="col-span-full flex items-center justify-center rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-video">
                <LoaderCircle aria-hidden className="size-7 animate-spin" />
              </div>
            ) : (
              participants.map((participant) => (
                <ParticipantTile key={participant.identity} participant={participant} />
              ))
            )}
          </div>

          <div className="mx-auto mt-4 flex max-w-full items-center gap-2 overflow-x-auto rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-control p-3 shadow-2xl sm:gap-3 sm:px-5">
            <RoomControlButton
              label="麦克风"
              active={microphoneEnabled}
              activeIcon={Mic}
              inactiveIcon={MicOff}
              onClick={() => void toggleMicrophone()}
            />
            <RoomControlButton
              label="摄像头"
              active={cameraEnabled}
              activeIcon={Video}
              inactiveIcon={VideoOff}
              onClick={() => void toggleCamera()}
            />
            <RoomControlButton
              label="共享屏幕"
              active={screenShareEnabled}
              activeIcon={MonitorUp}
              inactiveIcon={MonitorUp}
              onClick={() => void toggleScreenShare()}
            />
            <span className="mx-1 h-9 border-l border-meeting-room-foreground/10" aria-hidden />
            <Button
              type="button"
              variant="ghost"
              disabled={ending}
              onClick={() => void handleLeave()}
              className="flex h-14 min-w-20 flex-col gap-1 rounded-2xl bg-meeting-room-danger text-meeting-room-foreground hover:bg-meeting-room-danger/85"
            >
              {ending ? <LoaderCircle aria-hidden className="animate-spin" /> : <PhoneOff aria-hidden />}
              <span className="text-[0.7rem]">{canEndMeeting ? '结束会议' : '离开会议'}</span>
            </Button>
          </div>
        </div>
      </section>
      <aside className="hidden min-h-0 border-l border-meeting-line bg-meeting-room-sidebar text-foreground lg:block">
        <MeetingDecisionCollaborationPanel />
      </aside>
      {participants.flatMap((participant) =>
        [...participant.trackPublications.values()]
          .filter((publication) => publication.kind === Track.Kind.Audio && publication.track)
          .map((publication) => (
            <TrackAttachment
              key={publication.trackSid}
              track={publication.track!}
              muted={participant instanceof LocalParticipant}
            />
          )),
      )}
    </main>
  );
}

/** 渲染单个参与人的摄像头或占位画面。 */
function ParticipantTile({ participant }: { participant: Participant }) {
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const screenPublication = participant.getTrackPublication(Track.Source.ScreenShare);
  const videoTrack = screenPublication?.track ?? cameraPublication?.track;
  const isLocal = participant instanceof LocalParticipant;

  return (
    <article className="relative flex min-h-52 items-center justify-center overflow-hidden rounded-3xl border border-meeting-room-foreground/10 bg-meeting-room-video shadow-2xl">
      {videoTrack ? (
        <TrackAttachment track={videoTrack} muted={isLocal} className="size-full object-cover" />
      ) : (
        <span className="flex size-20 items-center justify-center rounded-full bg-meeting-room-control text-meeting-room-foreground/60">
          <UserRound aria-hidden className="size-9" />
        </span>
      )}
      <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3">
        <span className="truncate rounded-full bg-meeting-room-control/85 px-3 py-1 text-sm font-medium">
          {participant.name || participant.identity}
          {isLocal ? '（我）' : ''}
        </span>
        <UsersRound aria-hidden className="size-4" />
      </div>
    </article>
  );
}

/** 单个自研会议室媒体控制按钮属性。 */
type RoomControlButtonProps = {
  /** 控制名称。 */
  label: string;
  /** 当前是否开启。 */
  active: boolean;
  /** 开启图标。 */
  activeIcon: typeof Mic;
  /** 关闭图标。 */
  inactiveIcon: typeof Mic;
  /** 点击操作。 */
  onClick: () => void;
};

/** 渲染不依赖 LiveKit UI 的媒体控制按钮。 */
function RoomControlButton({
  label,
  active,
  activeIcon: ActiveIcon,
  inactiveIcon: InactiveIcon,
  onClick,
}: RoomControlButtonProps) {
  const Icon = active ? ActiveIcon : InactiveIcon;
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-14 min-w-16 flex-col gap-1 rounded-2xl text-meeting-room-foreground hover:bg-meeting-room-foreground/10 ${
        active ? '' : 'bg-meeting-room-foreground/10'
      }`}
    >
      <Icon aria-hidden />
      <span className="text-[0.7rem]">{active ? label : `${label}已关`}</span>
    </Button>
  );
}
