/**
 * 本文件协调无人接听快速通话和从未开始预约会议的过期终态。
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import {
  MeetingInvitationStatus,
  MeetingKind,
  MeetingParticipantRole,
  MeetingStatus,
} from '../../../generated/prisma';
import { MeetingLiveKitService } from './meeting-livekit.service';

/** 过期扫描不是精确定时业务，每分钟协调一次即可。 */
const EXPIRATION_SCAN_INTERVAL_MILLISECONDS = 60_000;

@Injectable()
export class MeetingExpirationService implements OnModuleInit, OnModuleDestroy {
  /** 记录协调任务失败，避免后台异常静默丢失。 */
  private readonly logger = new Logger(MeetingExpirationService.name);
  /** 当前进程持有的扫描定时器。 */
  private timer?: ReturnType<typeof setInterval>;
  /** 防止同一进程内上一轮尚未结束就再次扫描。 */
  private running = false;

  /** 注入数据库和 LiveKit 房间关闭服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveKitService: MeetingLiveKitService,
  ) {}

  /** 服务启动时立即补偿扫描，随后按固定间隔协调。 */
  onModuleInit(): void {
    void this.reconcileExpiredMeetings();
    this.timer = setInterval(
      () => void this.reconcileExpiredMeetings(),
      EXPIRATION_SCAN_INTERVAL_MILLISECONDS,
    );
    this.timer.unref?.();
  }

  /** 服务停止时释放进程内定时器。 */
  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** 幂等扫描全部已到期但尚未流转的会议。 */
  async reconcileExpiredMeetings(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await Promise.all([
        this.expireQuickCalls(now),
        this.expireAppointments(now),
      ]);
    } catch (error) {
      this.logger.error('会议过期状态协调失败', error);
    } finally {
      this.running = false;
    }
  }

  /** 把三十秒内无人接听的快速通话标记为已过期。 */
  private async expireQuickCalls(now: Date): Promise<void> {
    const meetings = await this.prisma.meetingSession.findMany({
      where: {
        kind: MeetingKind.QUICK_CALL,
        status: MeetingStatus.LIVE,
        ringExpiresAt: { lte: now },
        participants: {
          none: {
            role: MeetingParticipantRole.ATTENDEE,
            invitationStatus: MeetingInvitationStatus.ACCEPTED,
          },
        },
      },
      select: { id: true },
      take: 100,
    });
    for (const meeting of meetings) {
      const expired = await this.prisma.$transaction(async (tx) => {
        const result = await tx.meetingSession.updateMany({
          where: {
            id: meeting.id,
            status: MeetingStatus.LIVE,
            ringExpiresAt: { lte: now },
            participants: {
              none: {
                role: MeetingParticipantRole.ATTENDEE,
                invitationStatus: MeetingInvitationStatus.ACCEPTED,
              },
            },
          },
          data: { status: MeetingStatus.EXPIRED, endedAt: now },
        });
        if (result.count !== 1) return false;
        await tx.meetingParticipant.updateMany({
          where: {
            meetingId: meeting.id,
            invitationStatus: MeetingInvitationStatus.INVITED,
          },
          data: {
            invitationStatus: MeetingInvitationStatus.MISSED,
            respondedAt: now,
          },
        });
        return true;
      });
      if (expired) {
        await this.closeExpiredRoom(meeting.id);
      }
    }
  }

  /** 把超过计划结束时间且从未开始的预约会议标记为已过期。 */
  private async expireAppointments(now: Date): Promise<void> {
    const meetings = await this.prisma.meetingSession.findMany({
      where: {
        kind: MeetingKind.APPOINTMENT,
        status: MeetingStatus.SCHEDULED,
        scheduledAt: { not: null, lte: now },
        scheduledDurationMinutes: { not: null },
      },
      select: {
        id: true,
        scheduledAt: true,
        scheduledDurationMinutes: true,
      },
      take: 200,
    });
    for (const meeting of meetings) {
      const expiresAt = new Date(
        meeting.scheduledAt!.getTime() +
          meeting.scheduledDurationMinutes! * 60_000,
      );
      if (expiresAt > now) continue;
      await this.prisma.meetingSession.updateMany({
        where: {
          id: meeting.id,
          status: MeetingStatus.SCHEDULED,
          startedAt: null,
        },
        data: { status: MeetingStatus.EXPIRED, endedAt: expiresAt },
      });
    }
  }

  /** 关闭可能已由发起人建立的无人接听 LiveKit 房间。 */
  private async closeExpiredRoom(meetingId: number): Promise<void> {
    try {
      await this.liveKitService.closeRoom(meetingId);
    } catch (error) {
      this.logger.warn(`过期会议 ${meetingId} 的 LiveKit 房间关闭失败`, error);
    }
  }
}
