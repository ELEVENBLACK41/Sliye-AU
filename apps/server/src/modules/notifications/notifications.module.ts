/**
 * 本文件注册全站通知接口、用户级 Socket Gateway 和通知服务。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationGateway } from './gateways/notification.gateway';
import { NotificationsController } from './notifications.controller';
import { NotificationAccessService } from './services/notification-access.service';
import { NotificationTicketService } from './services/notification-ticket.service';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [
    NotificationAccessService,
    NotificationGateway,
    NotificationService,
    NotificationTicketService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
