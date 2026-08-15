/**
 * 本文件协调同一账号的多个浏览器标签，确保只有一个标签持有会议媒体连接。
 */
'use client';

import type { SerializableMeetingSession } from '../types/meeting-session.types';

/** 多标签协调器向会议 Controller 暴露的回调。 */
type MeetingTabCoordinatorHandlers = {
  /** 接收其他标签发布的可序列化会话状态。 */
  onRemoteState: (state: SerializableMeetingSession) => void;
  /** 当前媒体所有者收到其他标签的接管请求。 */
  onTakeoverRequest: (requesterTabId: string) => Promise<void>;
  /** 其他标签结束会议时同步清理本地状态。 */
  onMeetingEnded: (meetingId: number) => void;
};

/** 跨标签传输的稳定消息结构。 */
type MeetingTabMessage =
  | { type: 'SESSION_STATE'; senderTabId: string; state: SerializableMeetingSession }
  | { type: 'OWNER_HEARTBEAT'; senderTabId: string; meetingId: number; sentAt: number }
  | { type: 'TAKEOVER_REQUEST'; senderTabId: string } //其他标签请求接管
  | { type: 'SESSION_RELEASED'; senderTabId: string }
  | { type: 'MEETING_ENDED'; senderTabId: string; meetingId: number };

/** localStorage 降级租约。 */
type MeetingTabLease = {
  /** 当前租约所有者标签。 */
  tabId: string;
  /** 租约失效时间戳。 */
  expiresAt: number;
};

const STORAGE_VERSION = 'v1';
const TAB_ID_STORAGE_KEY = `nextnest:meeting-tab-id:${STORAGE_VERSION}`;
const HEARTBEAT_INTERVAL_MS = 2_000;
const LEASE_DURATION_MS = 7_000;

/** 生成并保存仅属于当前标签页的稳定标识。 */
function getOrCreateTabId(): string {
  try {
    const existing = window.sessionStorage.getItem(TAB_ID_STORAGE_KEY);
    if (existing) return existing;
  } catch {
    // 隐私模式或浏览器禁用 Storage 时仍允许当前内存会话继续工作。
  }
  const created = window.crypto.randomUUID(); //生成一个随机的UUID作为标签页的唯一标识
  try {
    window.sessionStorage.setItem(TAB_ID_STORAGE_KEY, created); //存储在本地存储里面，因为按照标签页面隔离
  } catch {
    // 协调器实例会在内存中缓存该标识，不依赖持久化才能完成当前页面生命周期。
  }
  return created;
}

/** 安全读取 localStorage，隐私模式或禁用存储时返回 `null`。 */
function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 安全写入 localStorage，并返回租约是否真正落盘。 */
function writeLocalStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** 安全删除 localStorage 键。 */
function removeLocalStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage 不可用时租约本身也不会持久存在，无需继续处理。
  }
}

/** 解析 localStorage 中的租约，损坏数据按无租约处理。 */
function parseLease(value: string | null): MeetingTabLease | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<MeetingTabLease>;
    return typeof parsed.tabId === 'string' && typeof parsed.expiresAt === 'number'
      ? { tabId: parsed.tabId, expiresAt: parsed.expiresAt }
      : null;
  } catch {
    return null;
  }
}

/** 单例多标签协调器。 */
export class MeetingTabCoordinator {
  private tabId: string | null = null;
  private userId: number | null = null;
  private meetingId: number | null = null;
  private channel: BroadcastChannel | null = null;
  private handlers: MeetingTabCoordinatorHandlers | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private releaseWebLock: (() => void) | null = null;
  private ownsMedia = false;

  /** 返回当前标签页标识；首次调用时延迟创建，避免服务端访问浏览器 API。 */
  getCurrentTabId(): string {
    this.tabId ??= getOrCreateTabId();
    return this.tabId;
  }

  /** 判断当前标签是否持有媒体所有权。 */
  isOwner(): boolean {
    return this.ownsMedia;
  }

  /** 按当前用户配置隔离的 BroadcastChannel 和协调回调。 */
  configure(userId: number, handlers: MeetingTabCoordinatorHandlers): void {
    this.handlers = handlers;
    if (this.userId === userId && this.channel) return;
    this.channel?.close();
    this.userId = userId;
    this.channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(this.channelName);
    if (this.channel) this.channel.onmessage = (event: MessageEvent<MeetingTabMessage>) => void this.handleMessage(event.data);
  }

  /** 尝试获取当前用户唯一的媒体所有权。 */
  async acquire(meetingId: number): Promise<boolean> {
    if (this.ownsMedia) return this.meetingId === meetingId;
    this.meetingId = meetingId;

    if (navigator.locks) {
      return new Promise<boolean>((resolve) => {
        void navigator.locks.request(this.lockName, { ifAvailable: true }, async (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          this.ownsMedia = true;
          this.startHeartbeat();
          resolve(true);
          await new Promise<void>((release) => {
            this.releaseWebLock = release;
          });
          this.releaseWebLock = null;
          this.stopHeartbeat();
          this.ownsMedia = false;
        });
      });
    }

    const acquired = this.acquireFallbackLease();
    if (acquired) {
      this.ownsMedia = true;
      this.startHeartbeat();
    }
    return acquired;
  }

  /** 请求当前所有者释放媒体，随后由调用方重试获取锁。 */
  requestTakeover(): void {
    this.post({ type: 'TAKEOVER_REQUEST', senderTabId: this.getCurrentTabId() });
  }

  /** 发布当前会议的可序列化状态。 */
  publishState(state: SerializableMeetingSession): void {
    if (!this.ownsMedia) return;
    this.post({ type: 'SESSION_STATE', senderTabId: this.getCurrentTabId(), state });
  }

  /** 广播会议已经由主持人结束。 */
  publishMeetingEnded(meetingId: number): void {
    this.post({ type: 'MEETING_ENDED', senderTabId: this.getCurrentTabId(), meetingId });
  }

  /** 释放当前标签持有的 Web Lock 或降级租约。 */
  async release(): Promise<void> {
    const wasOwner = this.ownsMedia;
    this.stopHeartbeat();
    this.removeFallbackLease();
    this.releaseWebLock?.();
    this.ownsMedia = false;
    this.meetingId = null;
    if (wasOwner) {
      this.post({ type: 'SESSION_RELEASED', senderTabId: this.getCurrentTabId() });
      await Promise.resolve();
    }
  }

  /** 关闭跨标签通道并释放本标签资源。 */
  async dispose(): Promise<void> {
    await this.release();
    this.channel?.close();
    this.channel = null;
    this.handlers = null;
    this.userId = null;
  }

  /** 返回当前用户的广播通道名称。 */
  private get channelName(): string {
    return `nextnest:meeting-session:${this.userId ?? 'anonymous'}`;
  }

  /** 返回当前用户的 Web Lock 名称。 */
  private get lockName(): string {
    return `nextnest:meeting-media:${this.userId ?? 'anonymous'}`;
  }

  /** 返回当前用户的 localStorage 降级租约键。 */
  private get leaseKey(): string {
    return `nextnest:meeting-media-lease:${STORAGE_VERSION}:${this.userId ?? 'anonymous'}`;
  }

  /** 发送一条跨标签消息。 */
  private post(message: MeetingTabMessage): void {
    this.channel?.postMessage(message);
  }

  /** 处理其他标签发送的状态、接管和结束事件。 */
  private async handleMessage(message: MeetingTabMessage): Promise<void> {
    if (message.senderTabId === this.getCurrentTabId()) return;
    if (message.type === 'SESSION_STATE') {
      this.handlers?.onRemoteState(message.state);
      return;
    }
    if (message.type === 'OWNER_HEARTBEAT') {
      this.handlers?.onRemoteState({
        meetingId: message.meetingId,
        title: null,
        areaName: null,
        mediaMode: null,
        status: 'OWNED_BY_OTHER_TAB',
        participantCount: 0,
        canEndMeeting: false,
        ownerTabId: message.senderTabId,
      });
      return;
    }
    if (message.type === 'TAKEOVER_REQUEST' && this.ownsMedia) {
      await this.handlers?.onTakeoverRequest(message.senderTabId);
      return;
    }
    if (message.type === 'MEETING_ENDED') {
      this.handlers?.onMeetingEnded(message.meetingId);
    }
  }

  /** 启动媒体所有者心跳，并同步刷新降级租约。 */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    const heartbeat = (): void => {
      if (!this.ownsMedia || this.meetingId === null) return;
      this.writeFallbackLease();
      this.post({
        type: 'OWNER_HEARTBEAT',
        senderTabId: this.getCurrentTabId(),
        meetingId: this.meetingId,
        sentAt: Date.now(),
      });
    };
    heartbeat();
    this.heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  }

  /** 停止媒体所有者心跳。 */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** 在 Web Locks 不可用时以短租约尝试占有媒体。 */
  private acquireFallbackLease(): boolean {
    const current = parseLease(readLocalStorage(this.leaseKey));
    if (current && current.tabId !== this.getCurrentTabId() && current.expiresAt > Date.now()) return false;
    const stored = this.writeFallbackLease();
    if (!stored) return true;
    return parseLease(readLocalStorage(this.leaseKey))?.tabId === this.getCurrentTabId();
  }

  /** 写入当前标签的短期媒体租约。 */
  private writeFallbackLease(): boolean {
    const lease: MeetingTabLease = {
      tabId: this.getCurrentTabId(),
      expiresAt: Date.now() + LEASE_DURATION_MS,
    };
    return writeLocalStorage(this.leaseKey, JSON.stringify(lease));
  }

  /** 仅删除属于当前标签的降级租约。 */
  private removeFallbackLease(): void {
    const current = parseLease(readLocalStorage(this.leaseKey));
    if (current?.tabId === this.getCurrentTabId()) removeLocalStorage(this.leaseKey);
  }
}

/** 全站共享的多标签会议协调器。 */
export const meetingTabCoordinator = new MeetingTabCoordinator();
