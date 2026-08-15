/**
 * 本文件校验全站通知 Socket Ticket 绑定的登录会话是否仍然有效。
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { AuthSessionStatus } from '../../../generated/prisma';

@Injectable()
export class NotificationAccessService {
  /** 注入数据库以实时校验用户会话。 */
  constructor(private readonly prisma: PrismaService) {}

  /** 验证 Ticket 对应的用户会话仍有效，防止退出登录后重新连接。 */
  async validateSession(userId: number, sessionId: string): Promise<boolean> {
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        status: AuthSessionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return Boolean(session);
  }
}
