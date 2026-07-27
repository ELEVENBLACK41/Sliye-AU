/**
 * 本文件注册议事、分区授权、聊天实时通信和审计读取能力。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatterChatGateway } from './gateways/matter-chat.gateway';
import { MattersController } from './matters.controller';
import { DiscussionAreaService } from './services/discussion-area.service';
import { MatterAccessService } from './services/matter-access.service';
import { MatterAuditService } from './services/matter-audit.service';
import { MatterChatTicketService } from './services/matter-chat-ticket.service';
import { MatterChatService } from './services/matter-chat.service';
import { MatterCoreService } from './services/matter-core.service';
import { MatterMemberService } from './services/matter-member.service';

@Module({
  imports: [AuthModule],
  controllers: [MattersController],
  providers: [
    MatterAccessService,
    MatterAuditService,
    MatterChatGateway,
    MatterChatService,
    MatterChatTicketService,
    MatterCoreService,
    MatterMemberService,
    DiscussionAreaService,
  ],
  exports: [MatterAccessService, MatterAuditService],
})
export class MattersModule {}
