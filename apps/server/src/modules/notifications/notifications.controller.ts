/**
 * 本文件提供当前登录用户的全站通知 Socket Ticket 接口。
 */
import { Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { NotificationService } from './services/notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  /** 注入全站通知服务。 */
  constructor(private readonly notificationService: NotificationService) {}

  /** 为当前登录会话签发只能进入自己私人频道的 Socket Ticket。 */
  @Post('socket-ticket')
  @ApiOperation({ summary: '签发全站通知 Socket Ticket' })
  issueSocketTicket(@Req() request: AuthenticatedRequest) {
    return this.notificationService.issueTicket(
      request.auth!.userId,
      request.auth!.sessionId,
    );
  }
}
