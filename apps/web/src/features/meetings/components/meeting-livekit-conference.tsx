/**
 * 本文件在 LiveKit RoomContext 内展示会议画面、实时参会状态和成员进出提示。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParticipants, useRoomContext, VideoConference } from '@livekit/components-react';
import type { MeetingParticipant } from '@workspace/contracts/meetings';
import { LogIn, LogOut, UsersRound } from 'lucide-react';
import { RoomEvent, type RemoteParticipant } from 'livekit-client';

import { Badge } from '@workspace/ui/components/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';

/** LiveKit 会议画面与参会状态属性。 */
type MeetingLiveKitConferenceProps = {
  /** 当前会议全部受邀成员。 */
  invitedParticipants: MeetingParticipant[];
};

/** 当前展示的一条参会成员进出提示。 */
type PresenceNotice = {
  /** 每次事件递增的稳定渲染标识。 */
  id: number;
  /** 进入或退出会议的中文提示。 */
  message: string;
  /** 提示对应的事件类型。 */
  type: 'joined' | 'left';
};

/** 在 LiveKit 上下文中组合视频会议、受邀成员状态和进出提示。 */
export function MeetingLiveKitConference({ invitedParticipants }: MeetingLiveKitConferenceProps) {
  const room = useRoomContext();
  const connectedParticipants = useParticipants();
  const noticeSequence = useRef(0);
  const [notice, setNotice] = useState<PresenceNotice | null>(null);
  const [departedUserIds, setDepartedUserIds] = useState<Set<number>>(
    () =>
      new Set(
        invitedParticipants
          .filter((participant) => participant.leftAt !== null)
          .map((participant) => participant.user.id),
      ),
  );

  /** 订阅远端参与者进入和退出事件，并同步当前页面的成员状态。 */
  useEffect(() => {
    /** 处理远端成员进入房间。 */
    function handleParticipantConnected(participant: RemoteParticipant): void {
      const userId = parseParticipantUserId(participant.identity);
      if (userId) {
        setDepartedUserIds((current) => {
          const next = new Set(current);
          next.delete(userId);
          return next;
        });
      }
      noticeSequence.current += 1;
      setNotice({
        id: noticeSequence.current,
        message: `${readParticipantName(participant)} 已进入会议`,
        type: 'joined',
      });
    }

    /** 处理远端成员退出房间。 */
    function handleParticipantDisconnected(participant: RemoteParticipant): void {
      const userId = parseParticipantUserId(participant.identity);
      if (userId) {
        setDepartedUserIds((current) => new Set(current).add(userId));
      }
      noticeSequence.current += 1;
      setNotice({
        id: noticeSequence.current,
        message: `${readParticipantName(participant)} 已退出会议`,
        type: 'left',
      });
    }

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    };
  }, [room]);

  /** 每条成员进出提示展示四秒后自动清除。 */
  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const onlineUserIds = new Set(
    connectedParticipants
      .map((participant) => parseParticipantUserId(participant.identity))
      .filter((userId): userId is number => userId !== null),
  );

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="relative min-h-[28rem] bg-neutral-950">
        <VideoConference className="h-full" />
        <div className="pointer-events-none absolute top-4 right-4 z-30" aria-live="polite" aria-atomic="true">
          {notice ? (
            <div
              key={notice.id}
              className="flex items-center gap-2 rounded-md border border-white/15 bg-neutral-900/95 px-4 py-3 text-sm text-white shadow-lg backdrop-blur"
            >
              {notice.type === 'joined' ? (
                <LogIn className="size-4 text-emerald-400" aria-hidden />
              ) : (
                <LogOut className="size-4 text-amber-400" aria-hidden />
              )}
              {notice.message}
            </div>
          ) : null}
        </div>
      </div>

      <Card className="h-full min-h-0 rounded-none border-y-0 border-r-0 bg-background shadow-none">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center justify-between gap-3 text-base">
            <span className="flex items-center gap-2">
              <UsersRound className="size-4" aria-hidden />
              参会成员
            </span>
            <Badge variant="secondary">
              {onlineUserIds.size}/{invitedParticipants.length} 在线
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="max-h-full overflow-y-auto p-3">
          <ul className="grid gap-2">
            {invitedParticipants.map((participant) => {
              const status = resolveParticipantStatus(participant, onlineUserIds, departedUserIds);

              return (
                <li key={participant.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {participant.user.name || `用户 ${participant.user.id}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatParticipantRole(participant.role)}</p>
                  </div>
                  <Badge variant={status === '在线' ? 'default' : 'outline'}>{status}</Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/** 把 LiveKit `user:{id}` 身份解析为业务用户主键。 */
function parseParticipantUserId(identity: string): number | null {
  const match = identity.match(/^user:(\d+)$/);
  const userId = Number(match?.[1]);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

/** 优先读取 LiveKit 展示名称，缺失时回退到稳定参与者身份。 */
function readParticipantName(participant: RemoteParticipant): string {
  return participant.name || participant.identity;
}

/** 合并 LiveKit 在线状态与会议历史字段，区分在线、已退出和未进入。 */
function resolveParticipantStatus(
  participant: MeetingParticipant,
  onlineUserIds: ReadonlySet<number>,
  departedUserIds: ReadonlySet<number>,
): '在线' | '已退出' | '未进入' {
  if (onlineUserIds.has(participant.user.id)) return '在线';
  if (departedUserIds.has(participant.user.id) || participant.joinedAt !== null) {
    return '已退出';
  }
  return '未进入';
}

/** 将会议参与角色转换为中文。 */
function formatParticipantRole(role: MeetingParticipant['role']): string {
  if (role === 'HOST') return '主持人';
  if (role === 'CO_HOST') return '联合主持人';
  return '参会人';
}
