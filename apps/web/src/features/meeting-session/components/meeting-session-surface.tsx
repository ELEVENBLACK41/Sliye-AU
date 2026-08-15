/**
 * 本文件渲染新版会议全屏房间和悬浮小窗复用的 LiveKit 媒体轨道。
 */
'use client';

import { useEffect, useRef } from 'react';
import { UserRound, UsersRound } from 'lucide-react';
import { LocalParticipant, type Participant, Track } from 'livekit-client';

import { useMeetingSession } from '../hooks/use-meeting-session';

/** 会议媒体舞台属性。 */
type MeetingSessionSurfaceProps = {
  /** 全屏舞台展示全部参与人，小窗只展示当前优先画面。 */
  variant: 'full' | 'mini';
};

/** 单个媒体轨道挂载属性。 */
type TrackAttachmentProps = {
  /** LiveKit 原生媒体轨道。 */
  track: Track;
  /** 本地媒体需要静音，避免声音回授。 */
  muted?: boolean;
  /** 媒体元素样式。 */
  className?: string;
};

/** 将 LiveKit Track 挂载到真实媒体元素，并在视图切换时安全释放元素。 */
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

/** 渲染全屏参与人网格或悬浮窗优先画面，并挂载所有远端音频。 */
export function MeetingSessionSurface({ variant }: MeetingSessionSurfaceProps) {
  const { participants, status, connectionError } = useMeetingSession();
  const visibleParticipants = variant === 'mini' ? selectMiniParticipants(participants) : participants;

  if (status === 'OWNED_BY_OTHER_TAB') {
    return (
      <div className="grid size-full place-items-center rounded-3xl bg-meeting-room-video px-5 text-center">
        <div>
          <UsersRound aria-hidden className="mx-auto size-7 text-meeting-room-foreground/55" />
          <p className="mt-3 text-sm font-medium">会议正在其他标签页中进行</p>
          <p className="mt-1 text-xs text-meeting-room-foreground/55">当前标签不会申请麦克风或摄像头权限</p>
        </div>
      </div>
    );
  }

  if (status === 'ERROR') {
    return (
      <div className="grid size-full place-items-center rounded-3xl bg-meeting-room-video px-5 text-center">
        <div>
          <p className="text-sm font-medium">暂时无法进入会议</p>
          <p className="mt-1 text-xs text-meeting-room-foreground/55">{connectionError || '请稍后重新连接'}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        variant === 'full'
          ? 'grid min-h-0 flex-1 auto-rows-fr gap-3 sm:grid-cols-2'
          : 'relative aspect-video overflow-hidden rounded-2xl bg-meeting-room-video'
      }
      aria-label="会议视频画面"
    >
      {visibleParticipants.length === 0 ? (
        <div className="col-span-full grid min-h-40 place-items-center rounded-3xl bg-meeting-room-video">
          <span className="size-7 animate-spin rounded-full border-2 border-meeting-room-foreground/20 border-t-meeting-room-foreground" />
        </div>
      ) : (
        visibleParticipants.map((participant) => (
          <ParticipantTile key={participant.identity} participant={participant} compact={variant === 'mini'} />
        ))
      )}
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
    </div>
  );
}

/** 小窗优先显示屏幕共享、远端参与人，最后回退到本地参与人。 */
function selectMiniParticipants(participants: Participant[]): Participant[] {
  const sharing = participants.find((participant) => participant.getTrackPublication(Track.Source.ScreenShare)?.track);
  if (sharing) return [sharing];
  const remote = participants.find((participant) => !(participant instanceof LocalParticipant));
  return remote ? [remote] : participants.slice(0, 1);
}

/** 渲染单个参与人的摄像头、共享屏幕或占位画面。 */
function ParticipantTile({ participant, compact }: { participant: Participant; compact: boolean }) {
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const screenPublication = participant.getTrackPublication(Track.Source.ScreenShare);
  const videoTrack = screenPublication?.track ?? cameraPublication?.track;
  const isLocal = participant instanceof LocalParticipant;

  return (
    <article
      className={`relative flex items-center justify-center overflow-hidden bg-meeting-room-video ${
        compact
          ? 'size-full rounded-2xl'
          : 'min-h-52 rounded-3xl border border-meeting-room-foreground/10 shadow-2xl'
      }`}
    >
      {videoTrack ? (
        <TrackAttachment track={videoTrack} muted={isLocal} className="size-full object-cover" />
      ) : (
        <span className="flex size-16 items-center justify-center rounded-full bg-meeting-room-control text-meeting-room-foreground/60 sm:size-20">
          <UserRound aria-hidden className="size-8 sm:size-9" />
        </span>
      )}
      <span className="absolute inset-x-3 bottom-3 w-fit max-w-[calc(100%-1.5rem)] truncate rounded-full bg-meeting-room-control/85 px-3 py-1 text-xs font-medium">
        {participant.name || participant.identity}
        {isLocal ? '（我）' : ''}
      </span>
    </article>
  );
}
