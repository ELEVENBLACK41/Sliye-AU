/**
 * 本文件注册项目、分区授权、聊天实时通信和审计读取能力。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProjectChatGateway } from './gateways/project-chat.gateway';
import { ProjectsController } from './projects.controller';
import { DiscussionAreaService } from './services/discussion-area.service';
import { ProjectAccessService } from './services/project-access.service';
import { ProjectAuditService } from './services/project-audit.service';
import { ProjectChatTicketService } from './services/project-chat-ticket.service';
import { ProjectChatService } from './services/project-chat.service';
import { ProjectCoreService } from './services/project-core.service';
import { ProjectMemberService } from './services/project-member.service';

@Module({
  imports: [AuthModule],
  controllers: [ProjectsController],
  providers: [
    ProjectAccessService,
    ProjectAuditService,
    ProjectChatGateway,
    ProjectChatService,
    ProjectChatTicketService,
    ProjectCoreService,
    ProjectMemberService,
    DiscussionAreaService,
  ],
  exports: [ProjectAccessService, ProjectAuditService],
})
export class ProjectsModule {}
