/**
 * 本文件展示可刷新恢复的全局快速来电卡片，并处理接听、拒绝和倒计时。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Phone, PhoneOff, Video } from 'lucide-react';
import type {
  IncomingMeetingCall,
  IncomingMeetingCallsResponse,
  MeetingDetail,
  RespondMeetingCallRequestPayload,
} from '@workspace/contracts/meetings';

import { Button } from '@workspace/ui/components/button';
import { requestData } from '@/services/request';
import { useNotificationStore } from '../store/notification-store';

/** 查询当前用户仍可响应的全部来电。 */
function loadIncomingCalls(): Promise<IncomingMeetingCallsResponse> {
  return requestData('/api/meetings/incoming-calls', {
    errorMessage: '来电状态加载失败',
  });
}

/** 向服务端提交接听或拒绝动作。 */
function respondToCall(
  meetingId: number,
  response: RespondMeetingCallRequestPayload['response'],
): Promise<MeetingDetail> {
  return requestData(`/api/meetings/${meetingId}/call-response`, {
    method: 'POST',
    body: { response },
    errorMessage: '来电响应失败',
  });
}

/** 渲染位于应用右上角的实时来电卡片。 */
export function IncomingCallRuntime() {
  const notifications = useNotificationStore((state) => state.notifications);
  const connectionStatus = useNotificationStore((state) => state.connectionStatus);
  const [calls, setCalls] = useState<IncomingMeetingCall[]>([]);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  const [now, setNow] = useState(0);
  const [responding, setResponding] = useState(false);

  const incomingEventKey = notifications
    .filter((item) => item.type === 'MEETING_INCOMING_CALL')
    .map((item) => item.id)
    .join('|');

  useEffect(() => {
    void loadIncomingCalls()
      .then(setCalls)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (connectionStatus !== 'connected' && incomingEventKey.length === 0) return;
    void loadIncomingCalls()
      .then(setCalls)
      .catch(() => undefined);
  }, [connectionStatus, incomingEventKey]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const activeCall = useMemo(
    () =>
      calls.find(
        (call) =>
          now > 0 &&
          !dismissedIds.includes(call.id) &&
          call.ringExpiresAt &&
          new Date(call.ringExpiresAt).getTime() > now,
      ) ?? null,
    [calls, dismissedIds, now],
  );

  /** 提交响应并在接听成功后进入自研会议房间。 */
  async function handleResponse(response: 'ACCEPT' | 'DECLINE'): Promise<void> {
    if (!activeCall) return;
    setResponding(true);
    try {
      await respondToCall(activeCall.id, response);
      setDismissedIds((current) => [...current, activeCall.id]);
      if (response === 'ACCEPT') {
        window.location.assign(`/meetings/${activeCall.id}/room`);
      }
    } finally {
      setResponding(false);
    }
  }

  if (!activeCall) return null;
  const secondsLeft = Math.max(0, Math.ceil((new Date(activeCall.ringExpiresAt!).getTime() - now) / 1_000));
  const CallIcon = activeCall.mediaMode === 'VIDEO' ? Video : Phone;

  return (
    <aside
      className="fixed right-4 top-4 z-[80] w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-meeting-accent/35 bg-card/95 shadow-2xl backdrop-blur-xl"
      aria-live="assertive"
      aria-label="快速来电"
    >
      <div className="h-1 bg-meeting-accent" style={{ width: `${(secondsLeft / 30) * 100}%` }} aria-hidden />
      <div className="p-5">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-meeting-accent-soft text-meeting-accent-foreground">
            <CallIcon aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-meeting-accent-foreground">
              {activeCall.mediaMode === 'VIDEO' ? '视频来电' : '语音来电'} · {secondsLeft} 秒
            </p>
            <h2 className="mt-1 truncate text-base font-semibold">{activeCall.createdBy.name ?? '会议发起人'}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{activeCall.title}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={responding}
            onClick={() => void handleResponse('DECLINE')}
            className="rounded-xl"
          >
            <PhoneOff aria-hidden />
            拒绝
          </Button>
          <Button
            type="button"
            disabled={responding}
            onClick={() => void handleResponse('ACCEPT')}
            className="rounded-xl bg-meeting-accent text-meeting-accent-foreground hover:bg-meeting-accent/85"
          >
            {responding ? <LoaderCircle aria-hidden className="animate-spin" /> : <Phone aria-hidden />}
            接听
          </Button>
        </div>
      </div>
    </aside>
  );
}
