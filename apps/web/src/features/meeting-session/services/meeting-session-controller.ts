/**
 * 本文件集中管理新版会议唯一的 LiveKit Room、媒体设备和跨标签所有权生命周期。
 */
'use client';

import {
  ConnectionState,
  DisconnectReason,
  MediaDeviceFailure,
  type Participant,
  type RemoteParticipant,
  Room,
  RoomEvent,
} from 'livekit-client';

import { AUTH_SESSION_CHANGED_EVENT } from '@/features/notifications/constants';
import { useMeetingSessionStore } from '../store/meeting-session-store';
import type {
  MeetingSessionFeedback,
  OpenMeetingSessionInput,
  SerializableMeetingSession,
} from '../types/meeting-session.types';
import {
  endMeetingSession,
  getMeetingSessionCredentials,
  getMeetingSessionDetail,
} from './meeting-session-client.service';
import { meetingTabCoordinator } from './meeting-tab-coordinator';

/** 全局会议运行时反馈监听器。 */
type MeetingSessionFeedbackListener = (feedback: MeetingSessionFeedback) => void;

const TAKEOVER_RETRY_COUNT = 10;
const TAKEOVER_RETRY_DELAY_MS = 300;
const SESSION_STORAGE_VERSION = 'v1';
const SESSION_STORAGE_KEY = `nextnest:meeting-session-snapshot:${SESSION_STORAGE_VERSION}`;

/** 整页刷新时保存在当前标签页中的安全会议快照；不包含令牌和媒体对象。 */
type PersistedMeetingSession = {
  /** 保存快照时的登录用户，防止账号切换后恢复旧会议。 */
  currentUserId: number;
  /** 待重新校验和连接的会议主键。 */
  meetingId: number;
  /** 刷新前使用全屏还是悬浮小窗。 */
  presentationMode: 'FULL' | 'MINI';
  /** 刷新前悬浮小窗是否处于收起状态。 */
  miniCollapsed: boolean;
};

/** 等待指定时长，供跨标签释放媒体锁后重试使用。 */
function delay(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/** 把浏览器媒体设备异常转换成用户可执行的中文提示。 */
function resolveMediaDeviceMessage(error: unknown, kind?: MediaDeviceKind): string {
  const deviceName = kind === 'videoinput' ? '摄像头' : kind === 'audioinput' ? '麦克风' : '媒体设备';
  const failure = MediaDeviceFailure.getFailure(error);
  if (failure === MediaDeviceFailure.NotFound) return `未检测到可用${deviceName}，你仍可继续参会`;
  if (failure === MediaDeviceFailure.PermissionDenied) return `${deviceName}权限被拒绝，请在浏览器设置中允许访问`;
  if (failure === MediaDeviceFailure.DeviceInUse) return `${deviceName}正被其他应用占用，请关闭占用后重试`;
  return `${deviceName}暂时不可用，你仍可继续参会`;
}

/** 在请求采集前确认浏览器中存在对应输入设备。 */
async function hasInputDevice(kind: 'audioinput' | 'videoinput'): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === kind);
  } catch {
    // 枚举受权限策略限制时仍交给 LiveKit 返回更准确的设备错误。
    return true;
  }
}

/** 新版会议全局媒体会话单例。 */
export class MeetingSessionController {
  private room: Room | null = null;
  private openingPromise: Promise<void> | null = null;
  private intentionalDisconnect = false;
  private feedbackListeners = new Set<MeetingSessionFeedbackListener>();
  private authListenerBound = false;
  private restoringUserId: number | null = null;

  /** 为根级运行时配置当前账号的跨标签通道和认证清理监听。 */
  configureUser(currentUserId: number | null): void {
    if (currentUserId !== null) {
      meetingTabCoordinator.configure(currentUserId, {
        onRemoteState: (state) => this.applyRemoteState(state),
        onTakeoverRequest: (requesterTabId) => this.releaseForTakeover(requesterTabId),
        onMeetingEnded: (meetingId) => this.handleRemoteMeetingEnded(meetingId),
      });
      useMeetingSessionStore.getState().patch({
        currentUserId,
        currentTabId: meetingTabCoordinator.getCurrentTabId(),
      });
      void this.restorePersistedSession(currentUserId);
    }
    if (!this.authListenerBound) {
      window.addEventListener(AUTH_SESSION_CHANGED_EVENT, this.handleAuthSessionChanged);
      this.authListenerBound = true;
    }
  }

  /** 打开或恢复一场新版会议，重复调用同一会议不会创建第二个 Room。 */
  async open({ meeting, currentUserId, presentationMode = 'FULL' }: OpenMeetingSessionInput): Promise<void> {
    this.configureUser(currentUserId);
    const state = useMeetingSessionStore.getState();
    if (meeting.status !== 'LIVE') {
      this.patch({
        meetingId: meeting.id,
        title: meeting.title,
        areaName: meeting.areaName,
        mediaMode: meeting.mediaMode,
        status: 'ERROR',
        connectionError: '当前会议不处于进行中状态，无法连接音视频房间',
        presentationMode: 'FULL',
      });
      return;
    }
    if (
      state.meetingId !== null &&
      state.meetingId !== meeting.id &&
      state.status !== 'IDLE' &&
      state.status !== 'ENDED'
    ) {
      const message = '当前已有一场会议正在进行，请先离开后再加入其他会议';
      this.emit({ type: 'error', message });
      throw new Error(message);
    }

    const currentRole = meeting.participants.find((item) => item.user.id === currentUserId)?.role;
    this.patch({
      meetingId: meeting.id,
      title: meeting.title,
      areaName: meeting.areaName,
      mediaMode: meeting.mediaMode,
      currentUserId,
      currentTabId: meetingTabCoordinator.getCurrentTabId(),
      canEndMeeting: currentRole === 'HOST' || currentRole === 'CO_HOST',
      presentationMode,
      miniCollapsed: presentationMode === 'FULL' ? false : state.miniCollapsed,
    });

    if (this.room && state.meetingId === meeting.id && this.room.state !== ConnectionState.Disconnected) return;
    if (this.openingPromise) return this.openingPromise;
    this.openingPromise = this.acquireAndConnect();
    try {
      await this.openingPromise;
    } finally {
      this.openingPromise = null;
    }
  }

  /** 重新连接当前失败的会议会话。 */
  async retry(): Promise<void> {
    if (this.openingPromise || this.room) return;
    this.openingPromise = this.acquireAndConnect();
    try {
      await this.openingPromise;
    } finally {
      this.openingPromise = null;
    }
  }

  /** 请求其他标签释放媒体，并在成功取得所有权后重新连接。 */
  async requestTakeover(): Promise<void> {
    const state = useMeetingSessionStore.getState();
    if (state.meetingId === null || state.currentUserId === null) return;
    meetingTabCoordinator.requestTakeover();
    this.patch({ status: 'ACQUIRING_TAB', connectionError: null });

    for (let attempt = 0; attempt < TAKEOVER_RETRY_COUNT; attempt += 1) {
      if (await meetingTabCoordinator.acquire(state.meetingId)) {
        await this.connectOwnedRoom();
        return;
      }
      await delay(TAKEOVER_RETRY_DELAY_MS);
    }

    const message = '原标签仍在使用会议，请关闭原标签或稍后重试';
    this.patch({ status: 'OWNED_BY_OTHER_TAB', connectionError: message });
    this.emit({ type: 'error', message });
  }

  /** 将会议展示切换到全屏房间。 */
  showFull(): void {
    const state = useMeetingSessionStore.getState();
    if (state.meetingId !== null) this.patch({ presentationMode: 'FULL', miniCollapsed: false });
  }

  /** 保留媒体连接并将会议缩小为全局悬浮窗。 */
  minimize(): void {
    const state = useMeetingSessionStore.getState();
    if (state.meetingId !== null && state.status !== 'IDLE' && state.status !== 'ENDED') {
      this.patch({ presentationMode: 'MINI' });
    }
  }

  /** 切换悬浮小窗的展开与紧凑状态。 */
  toggleMiniCollapsed(): void {
    const state = useMeetingSessionStore.getState();
    this.patch({ miniCollapsed: !state.miniCollapsed });
  }

  /** 切换当前用户麦克风并同步全局状态。 */
  async toggleMicrophone(): Promise<void> {
    const room = this.requireOwnedRoom();
    if (!room) return;
    const next = !useMeetingSessionStore.getState().microphoneEnabled;
    try {
      await room.localParticipant.setMicrophoneEnabled(next);
      this.patch({ microphoneEnabled: next, deviceWarning: null });
    } catch (error) {
      this.handleDeviceError(error, 'audioinput');
    }
  }

  /** 切换当前用户摄像头并同步全局状态。 */
  async toggleCamera(): Promise<void> {
    const room = this.requireOwnedRoom();
    if (!room) return;
    const next = !useMeetingSessionStore.getState().cameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(next);
      this.patch({ cameraEnabled: next, deviceWarning: null });
    } catch (error) {
      this.handleDeviceError(error, 'videoinput');
    }
  }

  /** 切换当前用户屏幕共享轨道。 */
  async toggleScreenShare(): Promise<void> {
    const room = this.requireOwnedRoom();
    if (!room) return;
    const next = !useMeetingSessionStore.getState().screenShareEnabled;
    try {
      await room.localParticipant.setScreenShareEnabled(next);
      this.patch({ screenShareEnabled: next });
    } catch {
      this.emit({ type: 'error', message: '屏幕共享未能启动' });
    }
  }

  /** 用户手势恢复被浏览器自动播放策略阻止的远端音频。 */
  async resumeAudio(): Promise<void> {
    try {
      await this.room?.startAudio();
      this.patch({ audioBlocked: false });
    } catch {
      this.emit({ type: 'error', message: '浏览器仍未允许播放会议声音' });
    }
  }

  /** 普通参与者离开会议，仅断开自己的媒体连接。 */
  async leave(): Promise<void> {
    await this.disconnectRoom();
    await meetingTabCoordinator.release();
    this.resetSession();
  }

  /** 主持人结束业务会议并通知所有标签退出。 */
  async end(): Promise<void> {
    const state = useMeetingSessionStore.getState();
    if (state.meetingId === null || !state.canEndMeeting) return;
    this.intentionalDisconnect = true;
    this.patch({ status: 'ENDING', connectionError: null });
    try {
      // 主持人先主动关闭本地 PeerConnection，再由服务端删除房间，避免 LiveKit
      // 把服务端强制关闭 DataChannel 记录成 User-Initiated Abort。
      await this.disconnectRoom();
      await endMeetingSession(state.meetingId);
      meetingTabCoordinator.publishMeetingEnded(state.meetingId);
      await meetingTabCoordinator.release();
      this.resetSession();
      this.emit({ type: 'ended', message: '会议已结束' });
    } catch (error) {
      this.intentionalDisconnect = false;
      const message = error instanceof Error ? error.message : '结束会议失败';
      this.patch({ status: 'ERROR', connectionError: message });
      this.emit({ type: 'error', message });
    }
  }

  /** 返回当前 Room 中的参与人；调用方通过 roomRevision 触发重新读取。 */
  getParticipants(): Participant[] {
    if (!this.room) return [];
    return [this.room.localParticipant, ...this.room.remoteParticipants.values()];
  }

  /** 订阅全局会议反馈，并返回取消订阅函数。 */
  subscribeFeedback(listener: MeetingSessionFeedbackListener): () => void {
    this.feedbackListeners.add(listener);
    return () => this.feedbackListeners.delete(listener);
  }

  /** 根级运行时卸载时释放监听器和客户端资源。 */
  async dispose(): Promise<void> {
    if (this.authListenerBound) {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, this.handleAuthSessionChanged);
      this.authListenerBound = false;
    }
    await this.disconnectRoom();
    await meetingTabCoordinator.dispose();
    this.resetSession();
  }

  /** 获取媒体所有权后创建唯一 Room。 */
  private async acquireAndConnect(): Promise<void> {
    const state = useMeetingSessionStore.getState();
    if (state.meetingId === null) return;
    this.patch({ status: 'ACQUIRING_TAB', connectionError: null, deviceWarning: null });
    const acquired = await meetingTabCoordinator.acquire(state.meetingId);
    if (!acquired) {
      this.patch({
        status: 'OWNED_BY_OTHER_TAB',
        ownerTabId: null,
        connectionError: null,
      });
      return;
    }
    await this.connectOwnedRoom();
  }

  /** 创建、绑定并连接当前标签拥有的 LiveKit Room。 */
  private async connectOwnedRoom(): Promise<void> {
    const state = useMeetingSessionStore.getState();
    if (state.meetingId === null || state.mediaMode === null) return;
    this.intentionalDisconnect = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    this.bindRoomEvents(room);
    this.patch({
      status: 'CONNECTING',
      ownerTabId: meetingTabCoordinator.getCurrentTabId(),
      connectionError: null,
    });

    try {
      const credentials = await getMeetingSessionCredentials(state.meetingId);
      await room.connect(credentials.serverUrl, credentials.participantToken);
      this.refreshRoomState();
      await this.enableInitialDevices(room, state.mediaMode);
      try {
        await room.startAudio();
      } catch {
        this.patch({ audioBlocked: true });
      }
      this.patch({ status: 'CONNECTED', connectionError: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : '会议连接失败';
      room.removeAllListeners();
      if (room.state !== ConnectionState.Disconnected) await room.disconnect();
      this.room = null;
      await meetingTabCoordinator.release();
      this.patch({ status: 'ERROR', connectionError: message, ownerTabId: null });
      this.emit({ type: 'error', message });
    }
  }

  /** 注册 Room 生命周期事件，并把变化转换为 Store 快照。 */
  private bindRoomEvents(room: Room): void {
    /** 刷新参与人并显示加入提示。 */
    const handleParticipantConnected = (participant: RemoteParticipant): void => {
      this.emit({ type: 'notice', message: `${participant.name || '一位成员'}已进入会议` });
      this.refreshRoomState();
    };
    /** 刷新参与人并显示离开提示。 */
    const handleParticipantDisconnected = (participant: RemoteParticipant): void => {
      this.emit({ type: 'notice', message: `${participant.name || '一位成员'}已离开会议` });
      this.refreshRoomState();
    };
    /** 映射 LiveKit 连接状态。 */
    const handleConnectionStateChanged = (connectionState: ConnectionState): void => {
      if (connectionState === ConnectionState.Reconnecting) this.patch({ status: 'RECONNECTING' });
      if (connectionState === ConnectionState.Connected) this.patch({ status: 'CONNECTED', connectionError: null });
    };
    /** 处理房间结束或异常断线。 */
    const handleDisconnected = (reason?: DisconnectReason): void => {
      if (this.intentionalDisconnect) return;
      if (reason === DisconnectReason.ROOM_DELETED) {
        void this.finishRemoteMeeting('主持人已结束会议');
        return;
      }
      void this.finishUnexpectedDisconnect();
    };

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.TrackSubscribed, () => this.refreshRoomState());
    room.on(RoomEvent.TrackUnsubscribed, () => this.refreshRoomState());
    room.on(RoomEvent.LocalTrackPublished, () => this.refreshRoomState());
    room.on(RoomEvent.LocalTrackUnpublished, () => this.refreshRoomState());
    room.on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged);
    room.on(RoomEvent.Connected, () => this.refreshRoomState());
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.MediaDevicesError, (error: Error, kind?: MediaDeviceKind) => this.handleDeviceError(error, kind));
  }

  /** 按会议媒体模式尝试开启本地麦克风和摄像头。 */
  private async enableInitialDevices(room: Room, mediaMode: 'AUDIO' | 'VIDEO'): Promise<void> {
    if (await hasInputDevice('audioinput')) {
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        this.patch({ microphoneEnabled: true });
      } catch (error) {
        this.handleDeviceError(error, 'audioinput');
      }
    } else {
      this.patch({ deviceWarning: '未检测到可用麦克风，你仍可继续参会' });
    }

    if (mediaMode === 'VIDEO' && (await hasInputDevice('videoinput'))) {
      try {
        await room.localParticipant.setCameraEnabled(true);
        this.patch({ cameraEnabled: true });
      } catch (error) {
        this.handleDeviceError(error, 'videoinput');
      }
    } else if (mediaMode === 'VIDEO') {
      this.patch({ deviceWarning: '未检测到可用摄像头，你仍可继续参会' });
    }
  }

  /** 刷新参与人数量、媒体轨道版本和跨标签快照。 */
  private refreshRoomState(): void {
    const participants = this.getParticipants();
    useMeetingSessionStore.getState().patch({ participantCount: participants.length });
    useMeetingSessionStore.getState().bumpRoomRevision();
    this.publishState();
  }

  /** 断开当前 Room，但不调用结束会议业务接口。 */
  private async disconnectRoom(): Promise<void> {
    const room = this.room;
    this.room = null;
    if (!room) return;
    this.intentionalDisconnect = true;
    room.removeAllListeners();
    if (room.state !== ConnectionState.Disconnected) await room.disconnect();
    this.intentionalDisconnect = false;
  }

  /** 当前标签失去媒体所有权时断开 Room 并保留只读会话提示。 */
  private async releaseForTakeover(requesterTabId: string): Promise<void> {
    const state = useMeetingSessionStore.getState();
    await this.disconnectRoom();
    await meetingTabCoordinator.release();
    this.patch({
      status: 'OWNED_BY_OTHER_TAB',
      ownerTabId: requesterTabId,
      microphoneEnabled: false,
      cameraEnabled: false,
      screenShareEnabled: false,
      participantCount: state.participantCount,
    });
    this.emit({ type: 'notice', message: '会议已切换到其他标签页' });
  }

  /** 应用其他标签发布的状态，不覆盖本标签已经拥有的媒体连接。 */
  private applyRemoteState(remote: SerializableMeetingSession): void {
    if (meetingTabCoordinator.isOwner()) return;
    const state = useMeetingSessionStore.getState();
    this.patch(
      {
        meetingId: remote.meetingId,
        title: remote.title ?? state.title,
        areaName: remote.areaName ?? state.areaName,
        mediaMode: remote.mediaMode ?? state.mediaMode,
        status: 'OWNED_BY_OTHER_TAB',
        participantCount: remote.participantCount || state.participantCount,
        canEndMeeting: remote.canEndMeeting || state.canEndMeeting,
        ownerTabId: remote.ownerTabId,
        presentationMode: state.meetingId === null ? 'MINI' : state.presentationMode,
      },
      false,
    );
  }

  /** 处理其他标签广播的会议结束事件。 */
  private handleRemoteMeetingEnded(meetingId: number): void {
    if (useMeetingSessionStore.getState().meetingId !== meetingId) return;
    void this.finishRemoteMeeting('主持人已结束会议');
  }

  /** 清理被远端结束的会议并通知根运行时处理页面反馈。 */
  private async finishRemoteMeeting(message: string): Promise<void> {
    await this.disconnectRoom();
    await meetingTabCoordinator.release();
    this.resetSession();
    this.emit({ type: 'ended', message });
  }

  /** LiveKit 自动重连彻底失败后释放失效 Room 和媒体锁，使用户可以主动重试。 */
  private async finishUnexpectedDisconnect(): Promise<void> {
    const room = this.room;
    this.room = null;
    room?.removeAllListeners();
    await meetingTabCoordinator.release();
    this.patch({
      status: 'ERROR',
      ownerTabId: null,
      connectionError: '会议连接已断开，请检查网络后重新连接',
      microphoneEnabled: false,
      cameraEnabled: false,
      screenShareEnabled: false,
    });
  }

  /** 将设备错误写入全局状态并展示错误反馈。 */
  private handleDeviceError(error: unknown, kind?: MediaDeviceKind): void {
    const message = resolveMediaDeviceMessage(error, kind);
    this.patch({ deviceWarning: message });
    this.emit({ type: 'error', message });
  }

  /** 仅允许媒体所有者标签操作 Room。 */
  private requireOwnedRoom(): Room | null {
    if (!meetingTabCoordinator.isOwner() || !this.room) {
      this.emit({ type: 'error', message: '会议媒体正在其他标签页中使用' });
      return null;
    }
    return this.room;
  }

  /** 合并状态并在当前标签拥有媒体时广播最新快照。 */
  private patch(
    patch: Parameters<ReturnType<typeof useMeetingSessionStore.getState>['patch']>[0],
    publish = true,
  ): void {
    useMeetingSessionStore.getState().patch(patch);
    this.persistSession();
    if (publish) this.publishState();
  }

  /** 将可恢复的最小会议快照保存到当前标签页，整页刷新后重新向服务端校验。 */
  private persistSession(): void {
    const state = useMeetingSessionStore.getState();
    if (
      state.meetingId === null ||
      state.currentUserId === null ||
      state.status === 'IDLE' ||
      state.status === 'ENDED'
    ) {
      this.removePersistedSession();
      return;
    }
    const snapshot: PersistedMeetingSession = {
      currentUserId: state.currentUserId,
      meetingId: state.meetingId,
      presentationMode: state.presentationMode,
      miniCollapsed: state.miniCollapsed,
    };
    try {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage 被禁用时仍保留当前页面生命周期内的会议，不阻断音视频连接。
    }
  }

  /** 根运行时重新挂载后读取快照，并以服务端真实状态决定是否重新连接。 */
  private async restorePersistedSession(currentUserId: number): Promise<void> {
    if (this.restoringUserId === currentUserId || useMeetingSessionStore.getState().meetingId !== null) return;
    const snapshot = this.readPersistedSession();
    if (!snapshot || snapshot.currentUserId !== currentUserId) {
      if (snapshot) this.removePersistedSession();
      return;
    }
    this.restoringUserId = currentUserId;
    useMeetingSessionStore.getState().patch({
      meetingId: snapshot.meetingId,
      currentUserId,
      currentTabId: meetingTabCoordinator.getCurrentTabId(),
      presentationMode: snapshot.presentationMode,
      miniCollapsed: snapshot.miniCollapsed,
      status: 'CONNECTING',
    });
    try {
      const meeting = await getMeetingSessionDetail(snapshot.meetingId);
      if (meeting.status !== 'LIVE') {
        this.resetSession();
        return;
      }
      await this.open({ meeting, currentUserId, presentationMode: snapshot.presentationMode });
      this.patch({ miniCollapsed: snapshot.miniCollapsed });
    } catch {
      this.resetSession();
    } finally {
      this.restoringUserId = null;
    }
  }

  /** 安全解析当前标签页保存的会议快照，损坏数据按无快照处理。 */
  private readPersistedSession(): PersistedMeetingSession | null {
    try {
      const value = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (!value) return null;
      const parsed = JSON.parse(value) as Partial<PersistedMeetingSession>;
      if (
        Number.isInteger(parsed.currentUserId) &&
        Number.isInteger(parsed.meetingId) &&
        (parsed.presentationMode === 'FULL' || parsed.presentationMode === 'MINI') &&
        typeof parsed.miniCollapsed === 'boolean'
      ) {
        return parsed as PersistedMeetingSession;
      }
    } catch {
      // 损坏或不可访问的 Storage 不应阻塞根布局渲染。
    }
    return null;
  }

  /** 清除当前标签页的会议恢复快照。 */
  private removePersistedSession(): void {
    try {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage 不可用时无需额外处理。
    }
  }

  /** 同步清理内存会话与刷新恢复快照。 */
  private resetSession(): void {
    useMeetingSessionStore.getState().reset();
    this.removePersistedSession();
  }

  /** 发布当前 Store 的安全跨标签快照。 */
  private publishState(): void {
    if (!meetingTabCoordinator.isOwner()) return;
    const state = useMeetingSessionStore.getState();
    meetingTabCoordinator.publishState({
      meetingId: state.meetingId,
      title: state.title,
      areaName: state.areaName,
      mediaMode: state.mediaMode,
      status: state.status,
      participantCount: state.participantCount,
      canEndMeeting: state.canEndMeeting,
      ownerTabId: meetingTabCoordinator.getCurrentTabId(),
    });
  }

  /** 向所有根级反馈监听器发送一条消息。 */
  private emit(feedback: MeetingSessionFeedback): void {
    this.feedbackListeners.forEach((listener) => listener(feedback));
  }

  /** 登录或退出后清理旧账号的会议会话。 */
  private handleAuthSessionChanged = (): void => {
    void this.leave();
  };
}

/** 全站唯一的新版会议 Session Controller。 */
export const meetingSessionController = new MeetingSessionController();
